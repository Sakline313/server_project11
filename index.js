const express = require('express');
const cors = require('cors');
const app = express()
const port = 3000
// middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!Simple Crud Server is running')
})

app.listen(port, () => {
  console.log(`Example app listening Simple Crud Server is running on port ${port}`)
})
