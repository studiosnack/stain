const express = require('express');
const app = express();
const multer = require('multer');

// const upload = multer({ dest: 'uploads/'})
const storage = multer.memoryStorage();
const upload = multer({storage})

const PORT = 3000;

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

app.post('/photo/new', upload.single('foto'), (req, res, next) => {
  console.log(req.file)
  res.send('ok!')
});

console.log(`listening of ${PORT}`);

app.listen(PORT)