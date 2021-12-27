const express = require('express');
const app = express();
const multer = require('multer');
const exifReader = require('exif-reader')

// const upload = multer({ dest: 'uploads/'})
const storage = multer.memoryStorage();
const upload = multer({storage})

const PORT = 3000;

const sharp = require('sharp');

app.get('/', (req, res) => {
  res.send(`
  <!doctype html>
  <body>
  <form method="POST" action="/photo/new" enctype="multipart/form-data">
    <input type="file" name="foto" />
    <input type="submit" />
  </form>
  `)
})

app.post('/photo/new', upload.single('foto'), async (req, res, next) => {

  try {
    console.log(req.file)
    const meta = await sharp(req.file.buffer).metadata();
    const exifMeta = exifReader(meta.exif);
    console.log(meta)
    console.log(exifMeta)
    res.send('ok?')  
  } catch (err) {
    console.error(err)
    res.send('wuh woh');
  }
});

console.log(`listening of ${PORT}`);

app.listen(PORT)