const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// stripe setup
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// midleweare
app.use(cors());

// webhook api
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.WEBHOOK_SIGNING_SECRET_KEY);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // পেমেন্ট সফল হলে ডাটাবেজ আপডেট করুন
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        await Order.findOneAndUpdate(
            { stripeSessionId: session.id },
            { status: 'paid' }
        );
        console.log('Order marked as Paid!');
    }

    res.json({ received: true });
});

app.use(express.json());


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

        // all api is here

        // register api
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const password = req.body.password;
            const user = req.body;
            console.log(user)
            const existingUser = await userCollections.findOne({ email, password });
            if (!existingUser) {
                // Create new user
                await userCollections.insertOne(user);
            }
            res.send({ message: "User Already Exsist" });
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

        // payment intent api
        app.post('/create-payment-intent', async (req, res) => {
            const amount = req.body.amount;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount * 100, // Amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
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