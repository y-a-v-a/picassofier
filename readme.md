# picassofier

Use face detection to paste images of tribal masks upon faces in images. Makes use of opencv and libgd.

Installing opencv sucks. I have forked and cloned https://github.com/peterbraden/node-opencv locally and configured package.json to point to that directory. Then ran `npm i`. This should all work on nodeJS v10.14.0.

Create these directories:

- input - should contain images of people and/or faces
- masks - should contain PNG images of masks, preferably transparent background
- output - target direcoty where resulting images are stored

(c) 2018 y-a-v-a.org
