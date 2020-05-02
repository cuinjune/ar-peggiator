////////////////////////////////////////////////////////////////////////////////
// modules to import
////////////////////////////////////////////////////////////////////////////////

import * as THREE from 'https://threejs.org/build/three.module.js';
import { ARButton } from 'https://threejs.org/examples/jsm/webxr/ARButton.js';

////////////////////////////////////////////////////////////////////////////////
// global variables
////////////////////////////////////////////////////////////////////////////////

// detect mobile device or not
const isMobile = (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);

// socket.io
let socket;
let id; //my socket id

// array of connected clients
let clients = {};

// variable to store our three.js scene:
let glScene;

////////////////////////////////////////////////////////////////////////////////
// three.js scene
////////////////////////////////////////////////////////////////////////////////

class Scene {
	constructor(_width, _height) {

		const container = document.createElement('div');
		document.body.appendChild(container);

		// utility
		this.width = _width;
		this.height = _height;

		// scene
		this.scene = new THREE.Scene();

		// camera
		this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.025, 100);
		this.scene.add(this.camera);

		// light
		const light = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
		light.position.set(0.5, 1, 0.25);
		this.scene.add(light);

		// renderer
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(this.width, this.height);
		if (isMobile) {
			this.renderer.xr.enabled = true;
		}

		// push the canvas to the DOM
		container.appendChild(this.renderer.domElement);

		// window resize listener
		window.addEventListener("resize", () => this.windowResized());

		// AR button
		if (isMobile) {
			document.body.appendChild(ARButton.createButton(this.renderer));
			this.controller = this.renderer.xr.getController(0);
			this.controller.addEventListener('selectstart', () => this.onSelectStart());
			this.controller.addEventListener('select', () => this.onSelect());
			this.controller.addEventListener('selectend', () => this.onSelectEnd());
			this.scene.add(this.controller);
		}
		// touch state
		this.isTouched = false;
		this.touchedTime = 0;

		// add player
		this.addSelf();

		// note geometry
		this.radialSegments = 32;
		this.noteGeometry = new THREE.SphereBufferGeometry(0.0333, this.radialSegments, this.radialSegments);

		// add preview note
		this.addPreviewNote();

		// add notes array
		this.notes = [];

		// start the loop
		this.renderer.setAnimationLoop(() => this.update());
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Utils

	getRandomRange(from, to) {
		return Math.random() * (to - from) + from;
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Clients

	addPlayer(obj) {
		// dimension
		const playerEyeRadiusTop = 0.005;
		const playerEyeRadiusBottom = 0.01;
		const playerEyeHeight = 0.01;
		const playerBodyWidth = 0.0704;
		const playerBodyHeight = 0.1499;
		const playerBodyDepth = 0.0078;

		// geometry
		const playerEyeGeometry = new THREE.CylinderBufferGeometry(playerEyeRadiusTop, playerEyeRadiusBottom, playerEyeHeight, this.radialSegments).rotateX(Math.PI / 2);
		const playerBodyGeometry = new THREE.BoxBufferGeometry(playerBodyWidth, playerBodyHeight, playerBodyDepth);

		// material
		const playerEyeMaterial = new THREE.MeshLambertMaterial({ color: obj.color });
		const playerBodyMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.25, 0.25, 0.25) });

		// mesh
		obj.playerEye = new THREE.Mesh(playerEyeGeometry, playerEyeMaterial);
		obj.playerBody = new THREE.Mesh(playerBodyGeometry, playerBodyMaterial);
		obj.playerEye.position.z = playerEyeHeight * 0.5;

		// add body to eye
		obj.playerEye.add(obj.playerBody);

		// set body position relative to eye
		obj.playerBody.position.z = playerEyeHeight * 0.5 + playerBodyDepth * 0.5;
		obj.playerBody.position.y = -playerBodyHeight * 0.25;

		// add eye to player
		obj.player = new THREE.Group();
		obj.player.add(obj.playerEye);

		// add player to scene
		this.scene.add(obj.player);
	}

	addSelf() {
		this.color = new THREE.Color(0.5, 0.5, 0.5);
		this.addPlayer(this);
	}

	addPreviewNote() {
		const material = new THREE.MeshPhongMaterial({ color: this.color, transparent: true, opacity: 0.75 });
		this.previewedNote = new THREE.Mesh(this.noteGeometry, material);
		this.previewedNote.scale.set(0, 0, 0);
		this.previewedNote.visible = false;
		this.scene.add(this.previewedNote);
	}

	setPlayerLook(_id) {
		Math.seedrandom(_id);
		const colorR = this.getRandomRange(0.5, 1);
		const colorG = this.getRandomRange(0.5, 1);
		const colorB = this.getRandomRange(0.5, 1);
		this.color = new THREE.Color(colorR, colorG, colorB);
		this.playerEye.material.color.set(this.color);
		this.previewedNote.material.color.set(this.color);
	}

	addClient(_clientProp, _id) {
		const obj = {
			color: new THREE.Color().fromArray(_clientProp.color)
		};
		this.addPlayer(obj);
		clients[_id].player = obj.player;
	}

	removeClient(_id) {
		// remove player from scene
		if (clients[_id]) {
			this.scene.remove(clients[_id].player);
		}
	}

	updateClientMoves(_clientProps) {
		for (let _id in _clientProps) {
			if (_id != id && clients[_id]) {
				const lerpAmount = 0.2;
				const playerPosition = new THREE.Vector3().fromArray(_clientProps[_id].position);
				const playerQuaternion = new THREE.Quaternion().fromArray(_clientProps[_id].quaternion);
				clients[_id].player.position.lerp(playerPosition, lerpAmount);
				clients[_id].player.quaternion.slerp(playerQuaternion, lerpAmount);
			}
		}
	}

	updateNotes(_notes) {
		// remove all existing notes from scene
		for (let i = 0; i < this.notes.length; i++) {
			this.scene.remove(this.notes[i]);
		}
		// empty notes array
		this.notes = [];

		// add new notes to scene
		for (let i = 0; i < _notes.length; i++) {
			this.notes[i] = new THREE.Mesh(this.noteGeometry, new THREE.MeshPhongMaterial({ color: new THREE.Color().fromArray(_notes[i].color)}));
			this.notes[i].position.fromArray(_notes[i].position);
			this.scene.add(this.notes[i]);
		}
	}

	// data to send to the server
	getPlayerLook() {
		return [
			[this.color.r, this.color.g, this.color.b]
		];
	}

	getPlayerMove() {
		return [
			[this.player.position.x, this.player.position.y, this.player.position.z],
			[this.player.quaternion.x, this.player.quaternion.y, this.player.quaternion.z, this.player.quaternion.w]
		];
	}

	getNote() {
		return [
			[this.color.r, this.color.g, this.color.b],
			[this.previewedNote.position.x, this.previewedNote.position.y, this.previewedNote.position.z]
		];
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Interaction

	// called when window is resized
	windowResized() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.renderer.setSize(this.width, this.height);
		this.camera.aspect = this.width / this.height;
		this.camera.updateProjectionMatrix();
	}

	previewNote() {
		console.log("previewNote");
		this.isNotePreviewed = true;
		this.previewedNote.visible = true;
		this.previewedNote.position.set(0, 0, -0.1).applyMatrix4(this.controller.matrixWorld);
	}

	addNote() {
		// send note to server to update notes data (calls back updateNotes)
		socket.emit('addNote', this.getNote());
	}

	eraseNotes() {
		console.log("eraseNotes");
	}

	onSelectStart() {
		const time = Date.now();
		this.maxDoubleTapTime = 250;

		// if double tapped, erase notes
		if (time - this.touchedTime <= this.maxDoubleTapTime) {
			clearTimeout(this.previewNoteTimer);
			this.eraseNotes();
			this.isTouched = false;
		}
		else {
			this.isNotePreviewed = false;
			this.previewNoteTimer = setTimeout(() => this.previewNote(), this.maxDoubleTapTime);
			this.isTouched = true;
		}
		this.touchedTime = time;
	}

	onSelect() {
		if (this.isTouched) {
			if (this.isNotePreviewed) {
				this.addNote();
			}
			else {
				clearTimeout(this.previewNoteTimer);
			}
		}
	}

	onSelectEnd() {
		if (this.isTouched) {
			this.isTouched = false;
		}
		if (this.isNotePreviewed) {
			this.isNotePreviewed = false;
			this.previewedNote.visible = false;
			this.previewedNote.scale.set(0, 0, 0);
		}
	}

	getCameraPosition() {
		const position = new THREE.Vector3();
		position.setFromMatrixPosition(this.camera.matrixWorld);
		return position;
	}

	getCameraQuaternion() {
		const quaternion = new THREE.Quaternion();
		quaternion.setFromRotationMatrix(this.camera.matrixWorld);
		return quaternion;
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Rendering
	update() {

		// update player movement
		this.player.position.copy(this.getCameraPosition());
		this.player.quaternion.copy(this.getCameraQuaternion());

		// update previewed note movement
		if (this.isNotePreviewed) {
			const lerpAmount = 0.5;
			const previewedNotePosition = new THREE.Vector3().set(0, 0, -0.1).applyMatrix4(this.controller.matrixWorld);
			const previewedNoteScale = new THREE.Vector3(1, 1, 1);
			this.previewedNote.position.lerp(previewedNotePosition, lerpAmount);
			this.previewedNote.scale.lerp(previewedNoteScale, lerpAmount);
		}

		// send movement to server to update clients data (calls back updateClientMoves)
		socket.emit('move', this.getPlayerMove());

		// render
		this.renderer.render(this.scene, this.camera);
	}

}

////////////////////////////////////////////////////////////////////////////////
// socket.io
////////////////////////////////////////////////////////////////////////////////

// add client object
function addClient(_clientProp, _id) {
	console.log("Adding client with id " + _id);
	clients[_id] = {};
	glScene.addClient(_clientProp, _id);
}

// remove client object
function removeClient(_id) {
	console.log('A user disconnected with the id: ' + _id);
	glScene.removeClient(_id);
	delete clients[_id];
}

// establishes socket connection
function initSocketConnection() {
	socket = io();
	socket.on('connect', () => { });

	// on connection, server sends clients, his ID, and a list of all keys
	socket.on('introduction', (_clientProps, _id, _ids) => {
		// keep a local copy of my ID:
		console.log('My socket ID is: ' + _id);
		id = _id;

		// set player look
		glScene.setPlayerLook(id);

		// upload player look to server
		socket.emit('look', glScene.getPlayerLook());

		// for each existing user, add them as a client
		for (let i = 0; i < _ids.length; i++) {
			if (_ids[i] != id) { // add all existing clients except for myself
				addClient(_clientProps[_ids[i]], _ids[i]);
			}
		}
	});

	// when a new user has entered the server
	socket.on('newUserConnected', (_clientProp, clientCount, _id) => {
		console.log(clientCount + ' clients connected');
		let alreadyHasUser = false;
		for (let i = 0; i < Object.keys(clients).length; i++) {
			if (Object.keys(clients)[i] == _id) {
				alreadyHasUser = true;
				break;
			}
		}
		if (_id != id && !alreadyHasUser) {
			console.log('A new user connected with the id: ' + _id);
			addClient(_clientProp, _id); //add the new client with its id
		}
	});

	socket.on('userDisconnected', (_id) => {
		if (_id != id) {
			removeClient(_id);
		}
	});

	// update when one of the users moves in space
	socket.on('userMoves', _clientProps => {
		glScene.updateClientMoves(_clientProps);
	});

	// update when there is change to notes data
	socket.on('updateNotes', _notes => {
		glScene.updateNotes(_notes);
	});
}

////////////////////////////////////////////////////////////////////////////////
// three.js
////////////////////////////////////////////////////////////////////////////////

function createScene() {
	// initialize three.js scene
	console.log("Creating three.js scene...");
	glScene = new Scene(window.innerWidth, window.innerHeight);
}

////////////////////////////////////////////////////////////////////////////////
// start-up
////////////////////////////////////////////////////////////////////////////////

window.onload = async () => {

	// initialize socket connection
	initSocketConnection();

	// finally create the threejs scene
	createScene();
};