const gd = require('node-gd');
const cv = require('opencv');
const glob = require("glob");
const assert = require('assert');

const masks = glob.sync('./masks/mask*.png');
assert(masks.length > 0, 'Cannot find any masks*.png');

const masksList = [];

const sourceImages = glob.sync('./input/*.jpg');
assert(sourceImages.length > 0, 'Cannot find input images');

const sourceImagesList = [];

masks.forEach(el => {
  masksList.push(new Promise((resolve, reject) => {
    resolve(gd.openPng(el));
  }));
});

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
        image.copyResampled(newImage, 0, 0, 0, 0, newImage.width, newImage.height, image.width, image.height);
        resolve(newImage);
      });
    });
  }))
})

Promise.all(masksList).then(masks => {
  Promise.all(sourceImagesList).then(mainImages => {
    mainImages.forEach((mainImage, idx) => {
      cv.readImage(mainImage.jpegPtr(100, true), function(error, opencvMatrix) {
        if (error || !opencvMatrix) {
          throw error;
        }
        opencvMatrix.detectObject(cv.FACE_CASCADE, {
          scale: 1.3,
          neighbors: 3,
          // min: [(opencvMatrix.width / 8), (opencvMatrix.height / 5)]
          min: [80,80]
        }, function(error, facesData) {
          if (error || !facesData) {
            console.log(`No facesData for ${mainImage}`);
          }
          for (let i = 0; i < facesData.length; i++) {
            let idx = Math.round(Math.random() * (masks.length - 1));
            const randomMask = masks[idx];
            const faceCoords = facesData[i];
            console.log(faceCoords);
            const offsetX = 50;
            const offsetY = 90;

            randomMask.copyResized(mainImage,
              faceCoords.x - offsetX, faceCoords.y - offsetY,
              0, 0,
              faceCoords.width + (offsetX * 2), faceCoords.height + (offsetY * 2),
              randomMask.width, randomMask.height
            );
            // mainImage.rectangle(faceCoords.x, faceCoords.y, faceCoords.x + faceCoords.width, faceCoords.y + faceCoords.height, 0xff0000);
          }

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

