const fs = require('fs');
const exifReader = require('exif-reader')
const sharp = require('sharp')

const image_paths = [
// "archives/nsfmc_20211226/media/posts/202008/116032616_610318019901837_5891447346765325242_n_17847795614247964.jpg",
// "_DSC6477 Edited.JPG", "_DSC6486 Edited.JPG", "_DSC6486 Edited Location.JPG", 
"IMG_1490.HEIC"
]

image_paths.forEach(async path => {
  const d = fs.readFileSync(path);
  const img = await sharp(d)
  const meta = await img.metadata()
  console.log(meta)
  if (meta.exif) {
    console.log('exif')
    console.log(exifReader(meta.exif))
  }

})
// const d = fs.readFileSync('./input.heic');
// const img = sharp(d);

/*image_paths.map(image_path => fs.open(image_path, 'r', undefined, (err, fd) => {
  fs.read(fd, async (err, bytes, buf) => {
    const meta = await sharp(buf).metadata()
    console.log(image_path, 'meta')
    console.log(meta)
    if (meta.exif) {
      console.log('exif')
      console.log(exifReader(meta.exif))
    }
  })
})
)
*/