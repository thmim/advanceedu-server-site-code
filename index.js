const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 3000;

// midleweare
app.use(cors());
app.use(express.json());

// sample route
app.get('/', (req, res) => {
  res.send('website server')
})
app.listen(port, () => {
  console.log(`server is running on port: ${port}`)
})