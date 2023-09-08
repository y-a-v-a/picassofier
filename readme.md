# picassofier

Use face detection to paste images of tribal masks upon faces in images. Makes use of opencv and libgd.

Installing opencv sucks. I have forked and cloned https://github.com/peterbraden/node-opencv locally and configured package.json to point to that directory. Then ran `npm i`. This should all work on nodeJS v10.14.0.

Create these directories:

- input - should contain images of people and/or faces
- masks - should contain PNG images of masks, preferably transparent background
- output - target direcoty where resulting images are stored

(c) 2018 y-a-v-a.org


https://learnopencv.com/opencv-threshold-python-cpp/
https://docs.opencv.org/4.8.0/d8/d01/group__imgproc__color__conversions.html#gga4e0972be5de079fed4e3a10e24ef5ef0a95d70bf0c1b5aa58d1eb8abf03161f21