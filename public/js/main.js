////////////////////////////////////////////////////////////////////////////////
// modules to import
////////////////////////////////////////////////////////////////////////////////

import * as THREE from './three.module.js';
import { ARButton } from './arbutton.js';
import { Gimbal } from './gimbal.js';

////////////////////////////////////////////////////////////////////////////////
// global variables
////////////////////////////////////////////////////////////////////////////////

// detect mobile device or not
const isMobile = (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
if (isMobile) {
	document.getElementById("subtitle").style.display = "flex";
	document.getElementById("instruction").style.display = "flex";
}
else {
	const subtitle = document.getElementById("subtitle");
	subtitle.textContent = "Please visit the link with your Android device to use the AR app.\r\nHere you can see and hear existing users performance in real-time.";
	subtitle.style.display = "flex";
	const speakerToggle = document.getElementById("speakerToggle");
	speakerToggle.style.display = "flex";
	document.getElementById("info").style.zIndex = "-1";
}

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
		this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.02, 1100);
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
		else {
			// transparent background scene for desktop
			this.backgroundScene = new THREE.Scene();
			this.backgroundCamera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.02, 1100);
			this.backgroundScene.add(this.backgroundCamera);
		}
		// push the canvas to the DOM
		container.appendChild(this.renderer.domElement);

		// window resize listener
		window.addEventListener("resize", () => this.windowResized());

		if (isMobile) {
			// AR button
			document.body.appendChild(ARButton.createButton(this.renderer));
			this.controller = this.renderer.xr.getController(0);
			this.controller.addEventListener('selectstart', () => this.onSelectStart());
			this.controller.addEventListener('select', () => this.onSelect());
			this.controller.addEventListener('selectend', () => this.onSelectEnd());
			this.scene.add(this.controller);

			// for getting the device hardware rotation
			this.gimbal = new Gimbal();
			this.gimbal.enable();
		}
		else {
			// room mesh
			const geometry = new THREE.SphereBufferGeometry(500, 60, 40);
			// invert the geometry on the x-axis so that all of the faces point inward
			geometry.scale(-0.002, 0.002, 0.002);
			const texture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg');
			const material = new THREE.MeshBasicMaterial({ map: texture });
			const mesh = new THREE.Mesh(geometry, material);
			this.scene.add(mesh);
		}

		// touch state
		this.isTouched = false;
		this.touchedTime = 0;

		// color used for note and player eye (will be updated later from server)
		this.hue = 0;
		this.saturation = 1;
		this.lightness = 0.65;

		// used for linear interpolating the player rotation (for sending to pd)
		this.playerRotation = new THREE.Vector3(0, 0, 0);
		this.playerRotationLerpAmount = 0.5;

		// used for animating the playing note
		this.lightnessHighlighted = 0.9;
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
			{ value: 72, name: "C5" },
			{ value: 74, name: "D5" },
			{ value: 76, name: "E5" },
			{ value: 77, name: "F5" },
			{ value: 79, name: "G5" },
			{ value: 81, name: "A5" },
			{ value: 83, name: "B5" },
			{ value: 84, name: "C6" }
		];

		// add player
		this.addSelf();

		if (isMobile) {
			// add preview note
			this.addPreviewNote();

			// add note texts
			this.noteTexts = [];
			const fontLoader = new THREE.FontLoader();
			fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => this.addNoteTexts(font));
		}
		else {
			this.player.visible = false;
		}

		// notes array to be copied from server notes
		this.notes = [];

		// array of note ids in string for a sequencer to play (stored in reverse play order)
		this.noteToPlayIds = [];

		// used for playing poly notes
		this.notesToPlayIds = {}; // notesToPlayIds[clientID] = array of note ids in string for a sequencer to play

		// array of pointer to the playing notes stored with note id as keys
		this.notesToPlay = {};

		// start the sequencer clock (sync with other users as much as possible)
		this.sequencerClockTime = 174; // this should be changed with the pd patch's delay tempo
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

	addNoteTexts(font) {
		const textMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
		for (let i = 0; i < this.midiNoteMap.length; i++) {
			const textGeometry = new THREE.TextGeometry(this.midiNoteMap[i].name, {
				font: font,
				size: 0.008,
				height: 0.004,
				curveSegments: 12,
				bevelEnabled: false,
				bevelThickness: 10,
				bevelSize: 8,
				bevelOffset: 0,
				bevelSegments: 3
			});
			textGeometry.center();
			const noteText = new THREE.Mesh(textGeometry, textMaterial);
			noteText.position.set(0, 0.05, -0.1);
			noteText.rotation.x = THREE.Math.degToRad(15);
			noteText.visible = false;
			this.noteTexts.push(noteText);
			this.camera.add(noteText); // adding to camera so these can be seen relative to camera
		}
	}

	////////////////////////////////////////////////////////////////////////////////
	// from server
	////////////////////////////////////////////////////////////////////////////////

	addClient(_clientProp, _id) {
		if (_clientProp.isMobile) {
			const obj = {
				color: new THREE.Color().setHSL(_clientProp.hue, this.saturation, this.lightness)
			};
			this.addPlayer(obj);
			clients[_id].player = obj.player;
			clients[_id].playerRotation = new THREE.Vector3(0, 0, 0);
			this.notesToPlayIds[_id] = [];
		}
	}

	updateClientMoves(_clientProps) {
		for (let _id in _clientProps) {
			if (_id != id && clients[_id] && _clientProps[_id].isMobile) {
				const playerPosition = new THREE.Vector3().fromArray(_clientProps[_id].position);
				const playerQuaternion = new THREE.Quaternion().fromArray(_clientProps[_id].quaternion);
				clients[_id].player.position.lerp(playerPosition, this.clientMoveLerpAmount);
				clients[_id].player.quaternion.slerp(playerQuaternion, this.clientMoveLerpAmount);
				if (!isMobile) {
					clients[_id].playerRotation = new THREE.Vector3().fromArray(_clientProps[_id].rotation);
				}
			}
		}
	}

	setHue(_hue) {
		if (isMobile) {
			this.hue = _hue;
			this.color = new THREE.Color().setHSL(this.hue, this.saturation, this.lightness);
			this.playerEye.material.color.set(this.color);
			this.previewedNote.material.color.set(this.color);
		}
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

	updateNotesToPlayIds(_clientProps) {
		if (!isMobile) {
			for (let _id in _clientProps) {
				if (_id != id && clients[_id] && _clientProps[_id].isMobile) {
					if (!this.notesToPlayIds[_id].length) {
						const noteToPlayIds = _clientProps[_id].noteToPlayIds;
						for (let i = 0; i < noteToPlayIds.length; i++) {
							this.notesToPlayIds[_id].push(noteToPlayIds[i]);
						}
					}
				}
			}
		}
	}

	removeClient(_clientProp, _id) {
		// remove player from scene
		if (clients[_id] && _clientProp.isMobile) {
			this.scene.remove(clients[_id].player);
			delete this.notesToPlayIds[_id];
		}
	}

	////////////////////////////////////////////////////////////////////////////////
	// to server
	////////////////////////////////////////////////////////////////////////////////

	getPlayerMove() {
		return [
			[this.player.position.x, this.player.position.y, this.player.position.z],
			[this.player.quaternion.x, this.player.quaternion.y, this.player.quaternion.z, this.player.quaternion.w],
			[this.playerRotation.x, this.playerRotation.y, this.playerRotation.z]
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

			// make note texts invisible
			for (let i = 0; i < this.noteTexts.length; i++) {
				if (this.noteTexts[i].visible) {
					this.noteTexts[i].visible = false;
				}
			}
		}
	}

	////////////////////////////////////////////////////////////////////////////////
	// untility
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

	normalize(value, min, max) {
		return (value - min) / (max - min);
	}

	////////////////////////////////////////////////////////////////////////////////
	// sequencer
	////////////////////////////////////////////////////////////////////////////////

	playNote(cameraPosition, numVoices, pdReceiverName) {
		let noteToPlayId = "", noteToPlay = null;
		while (this.noteToPlayIds.length && !noteToPlay) { // skip unfound note and play the next one
			noteToPlayId = this.noteToPlayIds.pop();
			noteToPlay = this.scene.getObjectByName(noteToPlayId);
		}
		if (noteToPlay) {
			const hsl = { h: 0, s: 0, l: 0 };
			noteToPlay.material.color.getHSL(hsl);
			noteToPlay.material.color.setHSL(hsl.h, hsl.s, this.lightnessHighlighted);
			if (noteToPlay.scale.x >= 1) { // ignore the previewed note which starts from scale 0 to 1
				noteToPlay.scale.set(this.scaleHighlighted, this.scaleHighlighted, this.scaleHighlighted);
			}
			this.notesToPlay[noteToPlayId] = noteToPlay; // store pointer to this note
			const notePositionY = noteToPlay.position.y;
			if (notePositionY >= this.minNotePositionY && notePositionY <= this.maxNotePositionY) {
				const notePositionYNormalized = this.normalize(notePositionY, this.minNotePositionY, this.maxNotePositionY);
				const midiNoteMapIndex = Math.min(Math.floor(notePositionYNormalized * this.midiNoteMap.length), this.midiNoteMap.length - 1);
				const noteDistance = noteToPlay.position.distanceTo(cameraPosition);
				const noteDistanceNormalized = Math.pow(this.normalize(noteDistance, this.maxNoteDistance, this.minNoteDistance), 2);
				if (Module.sendBang) { // check if emscripten module is ready
					// sending a number of voices to pd
					Module.sendFloat("numVoices", numVoices);
					// sending a note, velocity pair to pd
					Module.startMessage(2);
					Module.addFloat(this.midiNoteMap[midiNoteMapIndex].value);
					Module.addFloat(noteDistanceNormalized);
					Module.finishList(pdReceiverName);
				}
			}
		}
	}

	sequencerClock() {
		if (isMobile) {
			this.playNote(this.getCameraPosition(), 1, "note0");
		}
		else {
			socket.emit('getNotesToPlayIds');
			const numVoices = Object.keys(this.notesToPlayIds).length;
			let voiceNum = 0;
			for (const _id in this.notesToPlayIds) {
				this.noteToPlayIds = this.notesToPlayIds[_id];
				if (clients[_id]) {
					this.playNote(clients[_id].player.position, numVoices, "note" + voiceNum);
					voiceNum++;
				}
			}
		}
		this.sequencerClockTimer = setTimeout(() => this.sequencerClock(), this.sequencerClockTime);
	}

	////////////////////////////////////////////////////////////////////////////////
	// rendering
	////////////////////////////////////////////////////////////////////////////////

	animateNotesToPlay() {
		for (const _id in this.notesToPlay) {
			if (this.notesToPlay[_id]) {
				const hsl = { h: 0, s: 0, l: 0 };
				this.notesToPlay[_id].material.color.getHSL(hsl);
				// if the note is close enough to original, set to original and remove the note from array
				if (hsl.l - this.lightness < 0.001 && this.notesToPlay[_id].scale.x < 1.001) {
					this.notesToPlay[_id].material.color.setHSL(hsl.h, hsl.s, this.lightness);
					if (this.notesToPlay[_id].scale.x > 1) { // ignore the previewed note which starts from scale 0 to 1
						this.notesToPlay[_id].scale.set(1, 1, 1);
					}
					delete this.notesToPlay[_id];
				}
				else {
					this.notesToPlay[_id].material.color.lerp(new THREE.Color().setHSL(hsl.h, hsl.s, this.lightness), this.noteToPlayLerpAmount);
					if (this.notesToPlay[_id].scale.x > 1) { // ignore the previewed note which starts from scale 0 to 1
						this.notesToPlay[_id].scale.lerp(new THREE.Vector3(1, 1, 1), this.noteToPlayLerpAmount);
					}
				}
			}
			else {
				delete this.notesToPlay[_id];
			}
		}
	}

	update() {
		if (isMobile) {
			// update player movement
			this.player.position.copy(this.getCameraPosition());
			this.player.quaternion.copy(this.getCameraQuaternion());

			if (Module.sendBang) { // check if emscripten module is ready
				// let's use the device's hardware rotation which seems to be more stable 
				this.gimbal.update();
				this.playerRotation.lerp(new THREE.Vector3(-this.gimbal.pitch, this.gimbal.yaw, -this.gimbal.roll), this.playerRotationLerpAmount);
				const halfPI = Math.PI * 0.5;
				Module.sendFloat("env0", this.normalize(this.playerRotation.x, halfPI, -halfPI));
				Module.sendFloat("dec0", this.normalize(this.playerRotation.z, halfPI, -halfPI));
			}

			// send player movement to server (calls back updateClientMoves)
			socket.emit('playerMoved', this.getPlayerMove());

			// update previewed note movement
			if (this.isNotePreviewed) {
				const previewedNotePosition = new THREE.Vector3().set(0, 0, -0.1).applyMatrix4(this.controller.matrixWorld);
				const previewedNoteScale = new THREE.Vector3(1, 1, 1);
				this.previewedNote.position.lerp(previewedNotePosition, this.previewedNoteLerpAmount);
				this.previewedNote.scale.lerp(previewedNoteScale, this.previewedNoteLerpAmount);
				// display the note text
				const previewedNotePositionY = this.previewedNote.position.y;
				if (previewedNotePositionY >= this.minNotePositionY && previewedNotePositionY <= this.maxNotePositionY) {
					const previewedNotePositionYNormalized = this.normalize(previewedNotePositionY, this.minNotePositionY, this.maxNotePositionY);
					const midiNoteMapIndex = Math.min(Math.floor(previewedNotePositionYNormalized * this.midiNoteMap.length), this.midiNoteMap.length - 1);
					for (let i = 0; i < this.noteTexts.length; i++) {
						if (this.noteTexts[i].visible) {
							this.noteTexts[i].visible = false;
						}
					}
					this.noteTexts[midiNoteMapIndex].scale.copy(this.previewedNote.scale);
					this.noteTexts[midiNoteMapIndex].visible = true;
				}
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
				// send my noteToPlayIds to server
				socket.emit('addNoteToPlayIds', this.noteToPlayIds);
			}
			// for animating playing notes back to original
			this.animateNotesToPlay();

			// render
			this.renderer.render(this.scene, this.camera);
		}
		else { //isMobile == false

			// for animating playing notes back to original
			this.animateNotesToPlay();

			// send player movement to server (calls back updateClientMoves)
			socket.emit('playerMoved', this.getPlayerMove());

			// transparent background scene
			this.renderer.setViewport(0, 0, this.width, this.height);
			this.renderer.setScissor(0, 0, this.width, this.height);
			this.renderer.setScissorTest(true);
			this.renderer.setClearColor(0x000000, 0);
			this.renderer.render(this.backgroundScene, this.backgroundCamera);
			const numVoices = Object.keys(this.notesToPlayIds).length;
			let voiceNum = 0;
			for (const _id in this.notesToPlayIds) {
				this.noteToPlayIds = this.notesToPlayIds[_id];
				if (clients[_id]) {
					const halfPI = Math.PI * 0.5;
					Module.sendFloat("env" + voiceNum, this.normalize(clients[_id].playerRotation.x, halfPI, -halfPI));
					Module.sendFloat("dec" + voiceNum, this.normalize(clients[_id].playerRotation.z, halfPI, -halfPI));
					const height = Math.floor(this.height * 0.7);
					const width = Math.floor(height * 0.4737);
					const left = Math.floor(this.width / (numVoices + 1) * (voiceNum + 1) - width * 0.5);
					const bottom = Math.floor(this.height * 0.4 - height * 0.5);
					this.renderer.setViewport(left, bottom, width, height);
					this.renderer.setScissor(left, bottom, width, height);
					this.renderer.setScissorTest(true);
					this.camera.aspect = width / height;
					this.camera.position.copy(clients[_id].player.position);
					this.camera.quaternion.copy(clients[_id].player.quaternion);
					this.camera.updateProjectionMatrix();

					// render
					this.renderer.render(this.scene, this.camera);
					voiceNum++;
				}
			}
		}
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
function removeClient(_clientProp, _id) {
	console.log('A user disconnected with the id: ' + _id);
	glScene.removeClient(_clientProp, _id);
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
		socket.emit('setMobile', isMobile);

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
	socket.on('userDisconnected', (_clientProp, _id) => {
		if (_id != id) {
			removeClient(_clientProp, _id);
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

	// update when there is any change to notes data
	socket.on('updateNotesToPlayIds', _clientProps => {
		glScene.updateNotesToPlayIds(_clientProps);
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
	if (!isMobile) {
		document.body.onmousedown = function () {
			if (speaker.className == "speaker -off") {
				speaker.className = "speaker -on";
				resumeAudio();
			}
			else if (speaker.className == "speaker -on") {
				speaker.className = "speaker -off";
				suspendAudio();
			}
		};
	}

	// initialize socket connection
	initSocketConnection();

	// finally create the threejs scene
	createScene();
};