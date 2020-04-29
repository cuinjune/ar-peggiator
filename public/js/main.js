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

import * as THREE from 'https://threejs.org/build/three.module.js';
import { ARButton } from 'https://threejs.org/examples/jsm/webxr/ARButton.js';

class Scene {
	constructor(_width, _height, _socket) {

		const container = document.createElement('div');
		document.body.appendChild(container);

		// socket to communicate with the server
		this.socket = _socket;

		// utility
		this.width = _width;
		this.height = _height;

		// scene
		this.scene = new THREE.Scene();

		// camera
		this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.01, 100);
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

		// AR button
		if (isMobile) {
			document.body.appendChild(ARButton.createButton(this.renderer));
		}

		// window resize listener
		window.addEventListener("resize", () => this.windowResized());

		// controller
		if (isMobile) {
			this.controller = this.renderer.xr.getController(0);
			this.controller.addEventListener('select', () => this.onSelect());
			this.scene.add(this.controller);
		}

		// add player
		this.addSelf();

		// start the loop
		this.renderer.setAnimationLoop((time) => this.update(time));
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Clients

	addSelf() {
		// color
		const playerMaterial = new THREE.MeshLambertMaterial({ color: 0x9797CE });

		// player
		this.player = new THREE.Mesh(new THREE.CubeGeometry(0.1, 0.1, 0.1), playerMaterial);

		// add player to the scene
		this.scene.add(this.player);
	}

	addClient(_clientProp, _id) {
		// color
		const playerMaterial = new THREE.MeshLambertMaterial({ color: 0x9797CE });

		// player
		clients[_id].player = new THREE.Mesh(new THREE.CubeGeometry(0.04, 0.08, 0.01), playerMaterial);

		// add player to scene
		this.scene.add(clients[_id].player);
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

	// called when xr controller is selected
	onSelect() {
		// const geometry = new THREE.CylinderBufferGeometry(0, 0.05, 0.2, 32).rotateX(Math.PI / 2);
		// const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
		// const mesh = new THREE.Mesh(geometry, material);
		// mesh.position.set(0, 0, -0.3).applyMatrix4(this.controller.matrixWorld);
		// mesh.quaternion.setFromRotationMatrix(this.controller.matrixWorld);
		// this.scene.add(mesh);
	}

	//////////////////////////////////////////////////////////////////////
	//////////////////////////////////////////////////////////////////////
	// Rendering
	update(time) {

		if (isMobile) {
			var position = new THREE.Vector3();
			var quaternion = new THREE.Quaternion();
			var scale = new THREE.Vector3();
			this.camera.matrixWorld.decompose(position, quaternion, scale);
			this.player.position.copy(position);
			this.player.quaternion.copy(quaternion);
		}

		// send movement to server to update clients data (calls back updateClientMoves)
		this.socket.emit('move', this.getPlayerMove());

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
	glScene = new Scene(window.innerWidth, window.innerHeight, socket);
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