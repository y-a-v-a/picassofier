const gd = require('node-gd');
const cv = require('opencv');
const glob = require("glob");
const assert = require('assert');
const debug = require('debug')('picassofier');

const colors = [
  '0F65A9', // blue
  'FBD336', // yellow
  'CC202A', // red
  '0F6F4C', // green
  'E9E9EB', // white
  'EB8032' // orange
];

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
function loadMasks(masksList) {
  // create Promises to load masks
  const loadingPromises = masksList.map(loadMask);

  return Promise.all(loadingPromises);
}

/**
 * Load path to mask file as png using node-gd
 * @param {stirng} pathName
 * @returns {Promise<gd.Image>}
 */
function loadMask(pathName) {
  return new Promise((resolve, reject) => {
    resolve(gd.openPng(pathName));
  }).catch(error => {
    throw new Error(error);
  });
}

/**
 * Read path to masks and load them as pngs
 * @returns {Promise<gd.Image>}
 */
function getMasksAsPng() {
  const masksDirList = readMasksDir();
  return loadMasks(masksDirList);
}

/**
 * open input image and make it x wide proportionally
 * @param {string} pathToJpeg - the path to the image to resize
 */
function scaleJpeg(pathToJpeg) {
  const targetWidth = 1440;
  return new Promise((resolve, reject) => {
    gd.openJpeg(pathToJpeg, async (error, image) => {
      if (error) {
        return reject(error);
      }
      const scaledImage = await resizeImage(image, targetWidth);
      resolve(scaledImage);
    });
  });
}

/**
 * Proportionally scale image to given width
 * @param {gd.Image} image - the image to resize
 * @param {number} targetWidth - the target width to scale to
 * @returns {Promise<gd.Image} The resized image
 */
function resizeImage(image, targetWidth = 1024) {
  return new Promise((resolve, reject) => {
    const w = image.width;
    const h = image.height;
    const dw = targetWidth;
    const dh = Math.round((h / w) * targetWidth);

    gd.createTrueColor(dw, dh, (error, newImage) => {
      if (error) {
        return reject(error);
      }
      // copy original image on new x-based px canvas
      image.copyResampled(newImage, 0, 0, 0, 0, newImage.width, newImage.height, image.width, image.height);
      debug(`Scaled image to ${targetWidth}px width`);
      resolve(newImage);
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
  return Math.round(Math.random() * 5);
}

/**
 * Save image
 * @param {string} pathName Path to the location where to store the image
 * @param {gd.Image} imageData Data to store in the file
 * @returns {boolean} whehter saving was succesfull
 */
function saveImage(pathName, imageData) {
  const quality = getRandomJpegQuality();
  return new Promise((resolve, reject) => {
    imageData.saveJpeg(pathName, quality, error => {
      if (error) {
        return reject(error);
      }
      debug(`Saved result to ${pathName}`);
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
 * @returns {Promise}
 */
function getOpencvMatrix(jpegData) {
  return new Promise((resolve, reject) => {
    // load jpeg pointer into opencv
    cv.readImage(jpegData, (error, opencvMatrix) => {
      if (error || !opencvMatrix) {
        return reject(error || 'No opencvMatrix');
      }
      debug(`Found open cv matrix`);
      resolve(opencvMatrix);
    });
  });
}

/**
 * @param {Object}
 * @returns {Promise<Array>}
 */
function getFacesData(opencvMatrix) {
  const detectionOptions = {
    scale: 1.3,
    neighbors: 3,
    min: [80,80]
  };

  return new Promise((resolve, reject) => {
    opencvMatrix.detectObject(cv.FACE_CASCADE, detectionOptions, (error, facesData) => {
      if (error || !facesData) {
        return reject(error || `No facesData found`);
      }
      debug('Detected face data');
      resolve(facesData);
    });
  }).catch(reason => debug(reason));
}

/**
 * Get random number from 0 to max exclusive
 * @param {number} max - The threshold
 * @returns {number} The resulting number
 */
function randomIndex(max) {
  return Math.round(Math.random() * (max - 1));
}

/**
 * Create a function to retrieve a unique as possible index
 * @param {number} max - Initial threshold
 * @returns {Function} The function to call for a unique index
 */
function uniqueIndexCreator(max) {
  let indexCache = [];

  /**
   * @returns {number} The resulting index
   */
  const creator = function() {
    let tries = 0;
    let idx = randomIndex(max);

    while(indexCache.indexOf(idx) > -1 && tries <= (max - 1)) {
      idx = randomIndex(max);
      tries++;
    }
    indexCache.push(idx);
    return idx;
  };

  return creator;
}

async function main() {
  const maskImages = await getMasksAsPng();
  const sourceImages = readSourceDir();

  sourceImages.forEach(async sourceImage => {
    const scaledImage = await scaleJpeg(sourceImage);
    const jpegData = getJpegData(scaledImage);
    const opencvMatrix = await getOpencvMatrix(jpegData);

    // start face detection
    const facesData = await getFacesData(opencvMatrix);
    if (!facesData) {
      debug('No facesData found, skipping...');
      return;
    }

    // for every detected face, apply a mask or color to it
    const colorIndex = uniqueIndexCreator(colors.length);
    const maskIndex = uniqueIndexCreator(maskImages.length);

    for (let i = 0; i < facesData.length; i++) {
      const faceCoords = facesData[i];

      if (Math.round(Math.random()) === 0) {
        const offsetW = 18;
        const faceX = faceCoords.x + Math.floor(faceCoords.width / 2);
        const faceY = faceCoords.y + Math.floor(faceCoords.height / 2);
        const faceW = faceCoords.width - offsetW;

        // add baldesarri color
        const idx = colorIndex();
        const color = colors[idx];
        const colorNumber = parseInt(color, 16);

        scaledImage.filledEllipse(faceX, faceY, faceW, faceW, colorNumber);
        debug(`Added color dot to image`);
      } else {
        // reposition mask relative to detected face
        const offsetX = 40;
        const offsetY = 70;
        const faceX = faceCoords.x - offsetX;
        const faceY = faceCoords.y - offsetY;
        const faceW = faceCoords.width + (offsetX * 2);
        const faceH = faceCoords.height + (offsetY * 2);

        // grab random mask
        let idx = maskIndex();
        const randomMask = maskImages[idx];

        // copy mask upon face
        randomMask.copyResized(scaledImage,
          faceX, faceY,
          0, 0,
          faceW, faceH,
          randomMask.width, randomMask.height
        );
        // debug: show detected face as rectangle
        // scaledImage.rectangle(faceCoords.x, faceCoords.y, faceCoords.x + faceCoords.width,
        // faceCoords.y + faceCoords.height, 0xff0000);
        debug(`Added mask to image`);
      }
    }

    // scale image further down to create cubist image
    const rescaledImage = await resizeImage(scaledImage, 640);

    // save resulting image
    const fileName = getNewFileName();
    const saved = await saveImage(fileName, rescaledImage);
    if (!saved) {
      debug(`Could not save ${fileName}`);
    } else {
      debug('Saved resulting image');
    }
  });
}

main();
