# ARpeggiator
<img src="screenshot1.png" alt="Desktop Screenshot" width="1000"/>

The ARpeggiator is a collaborative augmented reality (AR) music-making application that works in **Chrome on Android** devices allowing multiple users to make music together in real-time by creating spherical notes in AR space.

The spherical notes created by users will be played in a loop while they are in the camera's view. The notes will be played in the order they are created. The vertical position of the note determines the pitch, and the distance between the note and the camera determines the velocity. Tilting the device along the x-axis controls the low-pass filter frequency, while the z-axis controls the decay of notes.

When another user joins, the notes created by other users will be visible to the newly joined user and they will also see each other's virtual phone in real-time in AR space. Since only the notes that are in the camera's view will be played, each user can play a different set of notes even though they are in the same AR space. This can generate interesting polyphonic/polyrhythmic patterns when two or more users share each other's audio by visiting the app link on a **desktop Chrome browser** or play together in the same physical space.

All these features make the app perfectly suitable for live performance as well as a collaborative musical experience.

Here's the [Link to the app](https://ar-peggiator.herokuapp.com/).
You can also use the following QR code to go to the app link on your Android device.

<img src="QR.png" alt="QR Code" width="200"/>

If you visit the link on your **desktop Chrome browser**, you can see and hear all connected Android users' performance in real-time.
<img src="screenshot2.png" alt="Desktop Screenshot" width="1000"/>

## How to use
* Touch the [START AR] button to start the app.
* Touch and hold down on the screen to see the preview note.
* Release your touch to create a note on the location.
* Double-tap on the screen to erase all notes in the camera view.
* Try tilting your phone to hear the sound changing.

## Setup
1. Installation of node.js is required. Follow [this guide](https://github.com/itp-dwd/2020-spring/blob/master/guides/installing-nodejs.md) to install it.
2. Run the following commands in the Terminal.
```
git clone https://github.com/cuinjune/ar-peggiator.git
cd ar-peggiator
npm install dependencies
npm start
```
3. Open your web browser and navigate to http://localhost:3000

## Tools & Libraries used
WebXR, Three.js, Pure Data, Emscripten, Node.js, Express, Socket.io, uuid

## References
* https://threejs.org/examples/webxr_ar_cones.html
* https://threejs.org/examples/jsm/webxr/ARButton.js
* https://github.com/marquizzo/three-gimbal

## Reporting bugs
Please post an [issue](https://github.com/cuinjune/ar-peggiator/issues) if you face any problem using the app.

## Author
* [Zack Lee](https://www.cuinjune.com/about): an MPS Candidate at [NYU ITP](https://itp.nyu.edu).
