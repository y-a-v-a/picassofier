const gd = require('node-gd');
const cv = require('opencv');
const glob = require("glob");
const assert = require('assert');

// retrieve mask images
const masks = glob.sync('./masks/mask*.png');
assert(masks.length > 0, 'Cannot find any masks*.png');

const masksList = [];

// retrieve person group images
const sourceImages = glob.sync('./input/*.jpg');
assert(sourceImages.length > 0, 'Cannot find input images');

const sourceImagesList = [];

// create Promises to load masks
masks.forEach(el => {
  masksList.push(new Promise((resolve, reject) => {
    resolve(gd.openPng(el));
  }));
});

// create promises to load destination images
sourceImages.forEach(el => {
  sourceImagesList.push(new Promise((resolve, reject) => {
    // open input image and make it 1024 wide proportionally
    gd.openJpeg(el, (error, image) => {
      if (error) {
        reject(error);
      }
      const w = image.width;
      const h = image.height;
      const dw = 1024;
      const dh = Math.round((h / w) * 1024);

      gd.createTrueColor(dw, dh, (error, newImage) => {
        if (error) {
          reject(error);
        }
        // copy original image on new 1024-based px canvas
        image.copyResampled(newImage, 0, 0, 0, 0, newImage.width, newImage.height, image.width, image.height);
        resolve(newImage);
      });
    });
  }))
})

Promise.all(masksList).then(masks => {
  Promise.all(sourceImagesList).then(mainImages => {
    // all Promises resolved, loop over destination images
    mainImages.forEach((mainImage, idx) => {
      // load jpeg pointer into opencv
      cv.readImage(mainImage.jpegPtr(100, true), function(error, opencvMatrix) {
        if (error || !opencvMatrix) {
          throw error;
        }
        // start face detection
        opencvMatrix.detectObject(cv.FACE_CASCADE, {
          scale: 1.3,
          neighbors: 3,
          min: [80,80]
        }, function(error, facesData) {
          if (error || !facesData) {
            console.log(`No facesData for ${mainImage}`);
          }
          // for every detected face, apply a mask to it
          for (let i = 0; i < facesData.length; i++) {
            // grab random mask
            let idx = Math.round(Math.random() * (masks.length - 1));
            const randomMask = masks[idx];
            const faceCoords = facesData[i];

            // reposition mask relative to detected face
            const offsetX = 50;
            const offsetY = 90;

            // copy mask upon face
            randomMask.copyResized(mainImage,
              faceCoords.x - offsetX, faceCoords.y - offsetY,
              0, 0,
              faceCoords.width + (offsetX * 2), faceCoords.height + (offsetY * 2),
              randomMask.width, randomMask.height
            );
            // debug: show detected face as rectangle
            // mainImage.rectangle(faceCoords.x, faceCoords.y, faceCoords.x + faceCoords.width, faceCoords.y + faceCoords.height, 0xff0000);
          }

          // save resulting image
          mainImage.saveJpeg(`./output/output-${Date.now()}.jpg`, Math.round(Math.random() * 10), (error) => {
            if (error) {
              throw error;
            }
          });
        });
      });
    });
  }).catch(function(error) {
    console.log(error);
  });
}).catch(function(error) {
  console.log(error);
});

