const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

// stripe setup
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// midleweare
app.use(cors({
    origin: true,
    credentials: true
}));

// webhook api
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.WEBHOOK_SIGNING_SECRET_KEY
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const orderId = paymentIntent.metadata.orderId;

        await orderCollections.updateOne(
            { _id: new ObjectId(orderId) },
            { $set: { status: 'paid' } }
        );
    }

    res.json({ received: true });
});

app.use(express.json());
app.use(cookieParser());
// verify token
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }

    jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized Access' });
        }
        req.decoded = decoded;
        next();
    });
};

// connect with mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@data-house.3s1f0x8.mongodb.net/?appName=Data-house`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // db collections
        const productCollections = client.db('advanceEduDB').collection('products')
        const userCollections = client.db('advanceEduDB').collection('users')
        const paymentCollections = client.db('advanceEduDB').collection('payments')
        const orderCollections = client.db('advanceEduDB').collection('orders');

        // all the api's are start from here

        // jsonweb token generate api
        app.post('/jwt', async (req, res) => {
            const userData = req.body;
            const token = jwt.sign(userData, process.env.JWT_ACCESS_SECRET, { expiresIn: '1d' })
            // set token in the cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: false,
            })
            // res.send({token})
            res.send({ success: true })
        })

        // register api
        app.post('/users', async (req, res) => {
            const { email, password, name } = req.body;

            const existingUser = await userCollections.findOne({ email });
            if (existingUser) {
                return res.send({ message: "User already exists" });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            await userCollections.insertOne({
                name,
                email,
                password: hashedPassword,
                createdAt: new Date()
            });

            res.send({ message: "User registered successfully" });
        });

        // login api
        app.post('/login', async (req, res) => {
            const { email, password } = req.body;

            const user = await userCollections.findOne({ email });
            if (!user) {
                return res.status(401).send({ message: "Invalid credentials" });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).send({ message: "Invalid credentials" });
            }

            const token = jwt.sign(
                { email: user.email },
                process.env.JWT_ACCESS_SECRET,
                { expiresIn: '1d' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                secure: false
            });

            res.send({ success: true });
        });

        // get login user
        app.get('/users/me', verifyToken, async (req, res) => {
            const user = await userCollections.findOne(
                { email: req.decoded.email },
                { projection: { password: 0 } }
            );

            res.send(user);
        });


        // products get api
        app.get('/products', async (req, res) => {
            const result = await productCollections.find().toArray();
            res.send(result)

        })

        // products post api
        app.post('/products', async (req, res) => {
            try {
                const productsDta = req.body;
                const result = await productCollections.insertOne(productsDta);

                res.status(201).send({
                    message: 'Products added successfully!',
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error('Error in Products:', error);
                res.status(500).send({ message: 'Failed to add products. Please try again later.' });
            }
        })

        // create order
        app.post('/orders', verifyToken, async (req, res) => {
            const order = {
                email: req.decoded.email,
                products: req.body.products,
                amount: req.body.amount,
                status: 'pending',
                createdAt: new Date()
            };

            const result = await orderCollections.insertOne(order);
            res.send(result);
        });

        // store payment history
        app.post('/payments', async (req, res) => {
            const productInfo = req.body;
            try {
                const paymentResult = await paymentCollections.insertOne(productInfo);
                res.status(201).send({
                    message: 'Payment recorded successfully',
                    insertedId: paymentResult.insertedId,

                });

            } catch (error) {
                console.error('Payment processing error:', error);
                res.status(500).json({ success: false, error: 'Internal server error' });
            }
        });

        // payment intent api
        app.post('/create-payment-intent', async (req, res) => {
            const { amount, orderId } = req.body;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount * 100, // Amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                    metadata: { orderId },
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                res.status(400).send({ error: error.message });
            }
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// sample route
app.get('/', (req, res) => {
    res.send('website server')
})
app.listen(port, () => {
    console.log(`server is running on port: ${port}`)
})