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

		// upload player look to server
		socket.emit('look', this.getPlayerLook());

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
		const cameraRadiusTop = 0.005;
		const cameraRadiusBottom = 0.01;
		const cameraHeight = 0.01;
		const deviceWidth = 0.0704;
		const deviceHeight = 0.1499;
		const deviceDepth = 0.0078;

		// geometry
		const cameraGeometry = new THREE.CylinderBufferGeometry(cameraRadiusTop, cameraRadiusBottom, cameraHeight, 32).rotateX(Math.PI / 2);
		const deviceGeometry = new THREE.BoxBufferGeometry(deviceWidth, deviceHeight, deviceDepth);

		// material
		const cameraMaterial = new THREE.MeshLambertMaterial({ color: obj.color.getHex() });
		const deviceMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.25, 0.25, 0.25).getHex() });

		// mesh
		const camera = new THREE.Mesh(cameraGeometry, cameraMaterial);
		const device = new THREE.Mesh(deviceGeometry, deviceMaterial);
		camera.position.z = cameraHeight * 0.5;

		// add the device to the camera
		camera.add(device);

		device.position.z = cameraHeight * 0.5 + deviceDepth * 0.5;
		device.position.y = -deviceHeight * 0.25;

		// add the player to the scene
		obj.player = new THREE.Group();
		obj.player.add(camera);

		// add player to scene
		this.scene.add(obj.player);
	}

	addSelf() {
		// color
		const colorR = this.getRandomRange(0.5, 1);
		const colorG = this.getRandomRange(0.5, 1);
		const colorB = this.getRandomRange(0.5, 1);
		this.color = new THREE.Color(colorR, colorG, colorB);
		this.addPlayer(this);
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

	addNote() {
		const geometry = new THREE.SphereBufferGeometry(0.025, 24, 24);
		const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(0, 0, -0.1).applyMatrix4(this.controller.matrixWorld);
		mesh.quaternion.setFromRotationMatrix(this.controller.matrixWorld);
		this.scene.add(mesh);
	}

	eraseNotes() {
	}

	onSelectStart() {
		this.isTouched = true;
		this.touchedTime = new Date();
		this.touchedCameraPosition = this.getCameraPosition();
		this.touchedCameraQuaternion = this.getCameraQuaternion();
	}

	onSelect() {
		if (this.isTouched) {
			this.addNote();
		}
	}

	onSelectEnd() {
		if (this.isTouched) {
			this.isTouched = false;
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
		if (this.isTouched) {
			const currentTime = new Date();
			const elapsedTime = currentTime - this.touchedTime;
			if (elapsedTime > 3000) {
				this.eraseNotes();
				this.isTouched = false;
			}
		}

		// update player movement
		this.player.position.copy(this.getCameraPosition());
		this.player.quaternion.copy(this.getCameraQuaternion());


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