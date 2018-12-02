const gd = require('node-gd');
const cv = require('opencv');
const glob = require("glob");
const assert = require('assert');

/**
 * @returns {Array<string>} List of found mask images
 */
function readMasksDir() {
  const masks = glob.sync('./masks/mask*.png');
  assert(masks.length > 0, 'Cannot find any masks*.png');
  return masks;
}

/**
 * @returns {Array<string>} List of found jpg files
 */
function readSourceDir() {
  const sourceImages = glob.sync('./input/*.jpg');
  assert(sourceImages.length > 0, 'Cannot find input images');
  return sourceImages;
}

/**
 * @param {Array<string>} masksList List of files to open
 * @returns {Promise<Promise<gd.Image>>}
 */
async function loadMasks(masksList) {
  // create Promises to load masks
  const loadingPromises = masksList.map(loadMask);

  return await Promise.all(loadingPromises);
}

/**
 * Load path to mask file as png using node-gd
 * @param {stirng} pathName
 * @returns {Promise<gd.Image>}
 */
async function loadMask(pathName) {
  return await new Promise((resolve, reject) => {
    resolve(gd.openPng(pathName));
  }).catch(error => {
    throw new Error(error);
  });
}

/**
 * Read path to masks and load them as pngs
 * @returns {Promise<gd.Image>}
 */
async function getMasksAsPng() {
  const masksDirList = readMasksDir();
  return await loadMasks(masksDirList);
}

/**
 * open input image and make it 1024 wide proportionally
 */
async function scaleJpeg(pathToJpeg) {
  return await new Promise((resolve, reject) => {
    gd.openJpeg(pathToJpeg, (error, image) => {
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
  });
}

/**
 * @returns {string} New filePath
 */
function getNewFileName() {
  return `./output/output-${Date.now()}.jpg`;
}

/**
 * @returns {number} A random rounded number between 0 and 10
 */
function getRandomJpegQuality() {
  return Math.round(Math.random() * 10);
}

/**
 * Save image
 * @param {string} pathName Path to the location where to store the image
 * @param {gd.Image} imageData Data to store in the file
 */
async function saveImage(pathName, imageData) {
  const quality = getRandomJpegQuality();
  return await new Promise((resolve, reject) => {
    imageData.saveJpeg(pathName, quality, error => {
      if (error) {
        return reject(error);
      }
      resolve(true);
    });
  });
}

/**
 * Get JPEG image data as raw data
 * @param {gd.Image} gdImage
 * @returns {Buffer}
 */
function getJpegData(gdImage) {
  return gdImage.jpegPtr(100, true);
}

/**
 * Gets the open cv matrix of jpeg data
 * @param {Buffer} jpegData
 * @retusn {Promise}
 */
async function getOpencvMatrix(jpegData) {
  return new Promise((resolve, reject) => {
    // load jpeg pointer into opencv
    cv.readImage(jpegData, (error, opencvMatrix) => {
      if (error || !opencvMatrix) {
        return reject(error || 'No opencvMatrix');
      }
      resolve(opencvMatrix);
    });
  });
}

/**
 * @param {Object}
 * @returns {Promise<Array>}
 */
async function getFacesData(opencvMatrix) {
  const detectionOptions = {
    scale: 1.3,
    neighbors: 3,
    min: [80,80]
  };

  return await new Promise((resolve, reject) => {
    opencvMatrix.detectObject(cv.FACE_CASCADE, detectionOptions, async (error, facesData) => {
      if (error || !facesData) {
        return reject(error || `No facesData found`);
      }
      resolve(facesData);
    });
  });
}

async function main() {
  const maskImages = await getMasksAsPng();
  const sourceImages = readSourceDir();

  const sourceImagesResampled = await Promise.all(sourceImages.map(async element => {
    return await scaleJpeg(element);
  }));

  sourceImagesResampled.forEach(async mainImage => {
    const jpegData = getJpegData(mainImage);
    const opencvMatrix = await getOpencvMatrix(jpegData);

    // start face detection
    const facesData = await getFacesData(opencvMatrix);

    // for every detected face, apply a mask to it
    for (let i = 0; i < facesData.length; i++) {
      // grab random mask
      let idx = Math.round(Math.random() * (maskImages.length - 1));
      const randomMask = maskImages[idx];
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
      // mainImage.rectangle(faceCoords.x, faceCoords.y, faceCoords.x + faceCoords.width,
      // faceCoords.y + faceCoords.height, 0xff0000);
    }

    // save resulting image
    const fileName = getNewFileName();
    const saved = await saveImage(fileName, mainImage);
  });
}

main();

