////////////////////////////////////////////////////////////////////////////////
// modules to import
////////////////////////////////////////////////////////////////////////////////

import * as THREE from 'https://threejs.org/build/three.module.js';
import { ARButton } from './arbutton.js';

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
		this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.02, 100);
		this.scene.add(this.camera);

		// light
		this.light = new THREE.HemisphereLight(0xffffff, 0x404040, 1);
		this.light.position.set(0, 2, 0);
		this.scene.add(this.light);

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

		// color used for note and player eye (will be updated later from server)
		this.hue = 0;
		this.saturation = 1;
		this.lightness = 0.7;

		// used for animating the playing note
		this.lightnessHighlighted = 0.95;
		this.scaleHighlighted = 1.05;
		this.color = new THREE.Color().setHSL(this.hue, this.saturation, this.lightness);

		// other properties and settings
		this.noteRadius = 0.0333;
		this.radialSegments = 32;
		this.playerBodyColor = new THREE.Color(0.25, 0.25, 0.25);
		this.noteGeometry = new THREE.SphereBufferGeometry(this.noteRadius, this.radialSegments, this.radialSegments);
		this.previewNoteOpacity = 0.75;
		this.clientMoveLerpAmount = 0.2;
		this.previewedNoteLerpAmount = 0.5;
		this.noteToPlayLerpAmount = 0.2;
		this.maxDoubleTapTime = 250;
		this.sequencerBpm = 120;
		this.minNotePositionY = -1; // below this will be muted
		this.maxNotePositionY = 1 // above this will be muted
		this.minNoteDistance = 0.02 // notes this close will produce maximum loudness
		this.maxNoteDistance = 10; // notes farther than this will be silent
		this.midiNoteMap = [
			{ value: 36, name: "C2" },
			{ value: 38, name: "D2" },
			{ value: 40, name: "E2" },
			{ value: 41, name: "F2" },
			{ value: 43, name: "G2" },
			{ value: 45, name: "A2" },
			{ value: 47, name: "B2" },
			{ value: 48, name: "C3" },
			{ value: 50, name: "D3" },
			{ value: 52, name: "E3" },
			{ value: 53, name: "F3" },
			{ value: 55, name: "G3" },
			{ value: 57, name: "A3" },
			{ value: 59, name: "B3" },
			{ value: 60, name: "C4" },
			{ value: 62, name: "D4" },
			{ value: 64, name: "E4" },
			{ value: 65, name: "F4" },
			{ value: 67, name: "G4" },
			{ value: 69, name: "A4" },
			{ value: 71, name: "B4" },
			{ value: 72, name: "C4" },
			{ value: 74, name: "D4" },
			{ value: 76, name: "E4" },
			{ value: 77, name: "F4" },
			{ value: 79, name: "G4" },
			{ value: 81, name: "A4" },
			{ value: 83, name: "B4" },
			{ value: 84, name: "C5" }
		];
		// add player
		this.addSelf();

		// add preview note
		this.addPreviewNote();

		// notes array to be copied from server notes
		this.notes = [];

		// array of note ids in string for a sequencer to play (stored in reverse play order)
		this.noteToPlayIds = [];

		// array of pointer to the playing notes stored with note id as a key
		this.notesToPlay = {};

		// start the sequencer clock (sync with other users as much as possible)
		this.sequencerClockTime = 15000 / this.sequencerBpm; // 16th-note milliseconds
		this.sequencerClockTimer = setTimeout(() => this.sequencerClock(), this.sequencerClockTime - (Date.now() % this.sequencerClockTime));

		// start the loop
		this.renderer.setAnimationLoop(() => this.update());
	}

	////////////////////////////////////////////////////////////////////////////////
	// start-up
	////////////////////////////////////////////////////////////////////////////////

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
		const playerBodyMaterial = new THREE.MeshLambertMaterial({ color: this.playerBodyColor });

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
		this.addPlayer(this);
	}

	addPreviewNote() {
		const material = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(this.hue, this.saturation, this.lightness), transparent: true, opacity: this.previewNoteOpacity });
		this.previewedNote = new THREE.Mesh(this.noteGeometry, material);
		this.previewedNote.scale.set(0, 0, 0);
		this.previewedNote.visible = false;
		this.previewedNote.name = "previewNote";
		this.scene.add(this.previewedNote);
	}

	////////////////////////////////////////////////////////////////////////////////
	// from server
	////////////////////////////////////////////////////////////////////////////////

	addClient(_clientProp, _id) {
		const obj = {
			color: new THREE.Color().setHSL(_clientProp.hue, this.saturation, this.lightness)
		};
		this.addPlayer(obj);
		clients[_id].player = obj.player;
	}

	updateClientMoves(_clientProps) {
		for (let _id in _clientProps) {
			if (_id != id && clients[_id]) {
				const playerPosition = new THREE.Vector3().fromArray(_clientProps[_id].position);
				const playerQuaternion = new THREE.Quaternion().fromArray(_clientProps[_id].quaternion);
				clients[_id].player.position.lerp(playerPosition, this.clientMoveLerpAmount);
				clients[_id].player.quaternion.slerp(playerQuaternion, this.clientMoveLerpAmount);
			}
		}
	}

	setHue(_hue) {
		this.hue = _hue;
		this.color = new THREE.Color().setHSL(this.hue, this.saturation, this.lightness);
		this.playerEye.material.color.set(this.color);
		this.previewedNote.material.color.set(this.color);
	}

	addedNoteID(_id) {
		// replace id of the last note to be played which is a preview note with the added note 
		if (this.noteToPlayIds.length) {
			this.noteToPlayIds[0] = _id;
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
			this.notes[i] = new THREE.Mesh(this.noteGeometry, new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(_notes[i].hue, this.saturation, this.lightness) }));
			this.notes[i].position.fromArray(_notes[i].position);
			this.notes[i].name = _notes[i].id; // so we can access the note from sequencer
			this.scene.add(this.notes[i]);
		}
	}

	removeClient(_id) {
		// remove player from scene
		if (clients[_id]) {
			this.scene.remove(clients[_id].player);
		}
	}

	////////////////////////////////////////////////////////////////////////////////
	// to server
	////////////////////////////////////////////////////////////////////////////////

	getPlayerMove() {
		return [
			[this.player.position.x, this.player.position.y, this.player.position.z],
			[this.player.quaternion.x, this.player.quaternion.y, this.player.quaternion.z, this.player.quaternion.w]
		];
	}

	getNotePosition() {
		return [this.previewedNote.position.x, this.previewedNote.position.y, this.previewedNote.position.z];
	}

	////////////////////////////////////////////////////////////////////////////////
	// interaction
	////////////////////////////////////////////////////////////////////////////////

	windowResized() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.renderer.setSize(this.width, this.height);
		this.camera.aspect = this.width / this.height;
		this.camera.updateProjectionMatrix();
	}

	previewNote() {
		this.isNotePreviewed = true;
		this.previewedNote.visible = true;
		this.previewedNote.position.set(0, 0, -0.1).applyMatrix4(this.controller.matrixWorld);
		this.noteToPlayIds.unshift(this.previewedNote.name); //prepend the preview note to be played lastly
	}

	addNote() {
		// send note position to server (calls back updateNotes)
		socket.emit('addNote', this.getNotePosition());
	}

	eraseNotes() {
		this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);
		const frustum = new THREE.Frustum();
		frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
		const ids = []; // array of ids to remove elements from notes data
		for (let i = 0; i < this.notes.length; i++) {
			if (frustum.containsPoint(this.notes[i].position)) {
				ids.push(this.notes[i].name);
			}
		}
		if (ids.length) {
			// send indices to remove to server (calls back updateNotes)
			socket.emit('eraseNotes', ids);
		}
	}

	onSelectStart() {
		const time = Date.now();

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

	////////////////////////////////////////////////////////////////////////////////
	// sequencer
	////////////////////////////////////////////////////////////////////////////////

	normalize(value, min, max) {
		return (value - min) / (max - min);
	}

	sequencerClock() {
		let noteToPlayId = "", noteToPlay = null;
		while (this.noteToPlayIds.length && !noteToPlay) { // skip unfound note and play the next one
			noteToPlayId = this.noteToPlayIds.pop();
			noteToPlay = this.scene.getObjectByName(noteToPlayId);
		}
		if (noteToPlay) {
			const hsl = { h: 0, s: 0, l: 0 };
			noteToPlay.material.color.getHSL(hsl);
			noteToPlay.material.color.setHSL(hsl.h, hsl.s, this.lightnessHighlighted);
			noteToPlay.scale.set(this.scaleHighlighted, this.scaleHighlighted, this.scaleHighlighted);
			this.notesToPlay[noteToPlayId] = noteToPlay; // store pointer to this note
			const notePositionY = noteToPlay.position.y;
			if (notePositionY >= this.minNotePositionY && notePositionY <= this.maxNotePositionY) {
				const notePositionYNormalized = this.normalize(notePositionY, this.minNotePositionY, this.maxNotePositionY);
				const midiNoteMapIndex = Math.min(Math.floor(notePositionYNormalized * this.midiNoteMap.length), this.midiNoteMap.length - 1);
				const noteDistance = noteToPlay.position.distanceTo(this.getCameraPosition());
				const noteDistanceNormalized = Math.pow(this.normalize(noteDistance, this.maxNoteDistance, this.minNoteDistance), 4);
				if (Module.sendBang) { // check if emscripten module is ready
					// sending a note, velocity pair to pd
					Module.startMessage(2);
					Module.addFloat(this.midiNoteMap[midiNoteMapIndex].value);
					Module.addFloat(noteDistanceNormalized);
					Module.finishList("playNote");
				}
			}
		}
		this.sequencerClockTimer = setTimeout(() => this.sequencerClock(), this.sequencerClockTime);
	}

	////////////////////////////////////////////////////////////////////////////////
	// rendering
	////////////////////////////////////////////////////////////////////////////////

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

	update() {
		// update player movement
		this.player.position.copy(this.getCameraPosition());
		this.player.quaternion.copy(this.getCameraQuaternion());

		// send player movement to server (calls back updateClientMoves)
		socket.emit('playerMoved', this.getPlayerMove());

		// update previewed note movement
		if (this.isNotePreviewed) {
			const previewedNotePosition = new THREE.Vector3().set(0, 0, -0.1).applyMatrix4(this.controller.matrixWorld);
			const previewedNoteScale = new THREE.Vector3(1, 1, 1);
			this.previewedNote.position.lerp(previewedNotePosition, this.previewedNoteLerpAmount);
			this.previewedNote.scale.lerp(previewedNoteScale, this.previewedNoteLerpAmount);
		}

		// if there's no more note left to play, check which notes are in camera view and store new notes to play
		if (this.noteToPlayIds.length == 0) {
			// if the user is currently previewing a note, push its name to the ids array (it will be played lastly) 
			if (this.isNotePreviewed) {
				this.noteToPlayIds.push(this.previewedNote.name);
			}
			this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);
			const frustum = new THREE.Frustum();
			frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
			for (let i = this.notes.length; i--;) {
				if (frustum.containsPoint(this.notes[i].position)) {
					// stored in reverse play order (first element will be played lastly)
					this.noteToPlayIds.push(this.notes[i].name);
				}
			}
		}

		// for animating the playing note back to original
		for (const noteToPlayId in this.notesToPlay) {
			if (this.notesToPlay[noteToPlayId]) {
				const hsl = { h: 0, s: 0, l: 0 };
				this.notesToPlay[noteToPlayId].material.color.getHSL(hsl);
				// if the note is close enough to original, set to original and remove the note from array
				if (hsl.l - this.lightness < 0.001 && this.notesToPlay[noteToPlayId].scale.x < 1.001) {
					this.notesToPlay[noteToPlayId].material.color.setHSL(hsl.h, hsl.s, this.lightness);
					this.notesToPlay[noteToPlayId].scale.set(1, 1, 1);
					delete this.notesToPlay[noteToPlayId];
				}
				else {
					this.notesToPlay[noteToPlayId].material.color.lerp(new THREE.Color().setHSL(hsl.h, hsl.s, this.lightness), this.noteToPlayLerpAmount);
					this.notesToPlay[noteToPlayId].scale.lerp(new THREE.Vector3(1, 1, 1), this.noteToPlayLerpAmount);
				}
			}
			else {
				delete this.notesToPlay[noteToPlayId];
			}
		}

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

	// when a user has been disconnected from the server
	socket.on('userDisconnected', (_id) => {
		if (_id != id) {
			removeClient(_id);
		}
	});

	// set hue value in the start-up
	socket.on('setHue', _hue => {
		glScene.setHue(_hue);
	});

	// send the added note id to myself after adding a note
	socket.on('addedNoteID', _id => {
		glScene.addedNoteID(_id);
	});

	// update when there is any change to notes data
	socket.on('updateNotes', _notes => {
		glScene.updateNotes(_notes);
	});

	// update when one of the users moves in space
	socket.on('updateClientMoves', _clientProps => {
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