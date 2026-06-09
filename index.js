import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const database = client.db("ticketBariDB");
    const usersCollection = database.collection("users");
    const bookingsCollection = database.collection("bookings");
    const transportsCollection = database.collection("transports");

    console.log("Connected smoothly to MongoDB Atlas!");

    // -------------------------------------------------------------------------
    // 🕵️‍♂️ ADMIN CHECK ROUTE
    // -------------------------------------------------------------------------
    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      if (email === 'admin@gmail.com') {
        return res.send({ admin: true });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ admin: user?.role === 'admin' });
    });

      // -------------------------------------------------------------------------
// 🚌 TRANSPORTS ROUTE (বাস/লঞ্চ/ট্রেনের লিস্ট ফ্রন্টএন্ডে দেখানোর API)
// -------------------------------------------------------------------------
app.get('/transports', async (req, res) => {
  try {
    const category = req.query.category; // যেমন: ?category=bus
    let query = {};
    
    if (category) {
      query.category = category; // শুধু নির্দিষ্ট ক্যাটাগরির ডেটা ফিল্টার করবে
    }

    const result = await transportsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error fetching transports data", error });
  }
});

    // -------------------------------------------------------------------------
    // 🎟️ TICKET BOOKING ROUTE (ইউজার যখন টিকিট কাটবে তখন এই এপিআই কল হবে)
    // -------------------------------------------------------------------------
    app.post('/bookings', async (req, res) => {
      const bookingData = req.body; 
      // bookingData অবজেক্টে থাকবে: { email, transportType (bus/train/launch), route, price, date }
      const result = await bookingsCollection.insertOne(bookingData);
      res.send(result);
    });

    // -------------------------------------------------------------------------
    // 🔒 SECURE ADMIN PANEL ROUTES
    // -------------------------------------------------------------------------
    app.get('/admin/bookings', async (req, res) => {
      const email = req.query.email;
      if (email !== 'admin@gmail.com') {
        const user = await usersCollection.findOne({ email: email });
        if (user?.role !== 'admin') {
          return res.status(403).send({ message: 'Forbidden Access!' });
        }
      }
      const result = await bookingsCollection.find().toArray();
      res.send(result);
    });

    // 📊 ড্যাশবোর্ডের ক্যাটাগরিভিত্তিক স্ট্যাটস ক্যালকুলেশন এপিআই
    app.get('/admin/stats', async (req, res) => {
      const email = req.query.email;
      if (email !== 'admin@gmail.com') {
        const user = await usersCollection.findOne({ email: email });
        if (user?.role !== 'admin') {
          return res.status(403).send({ message: 'Forbidden Access!' });
        }
      }

      const totalBookings = await bookingsCollection.countDocuments();
      const totalUsers = await usersCollection.countDocuments();
      
      // ট্রান্সপোর্ট টাইপ অনুযায়ী আলাদা আলাদা কাউন্ট করা
      const busTickets = await bookingsCollection.countDocuments({ transportType: 'bus' });
      const trainTickets = await bookingsCollection.countDocuments({ transportType: 'train' });
      const launchTickets = await bookingsCollection.countDocuments({ transportType: 'launch' });

      // ডাইনামিক রেভিনিউ হিসাব (টিকিটের দামের যোগফল)
      const bookingsArray = await bookingsCollection.find().toArray();
      const totalRevenue = bookingsArray.reduce((sum, booking) => sum + (Number(booking.price) || 0), 0);

      res.send({
        totalBookings,
        totalUsers,
        totalRevenue,
        busTickets,
        trainTickets,
        launchTickets
      });
    });

  } catch (error) {
    console.error("Database error:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Ticket Bari Server Engine is Running Successfully...');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// 🔍 GET BOOKINGS BY EMAIL: নির্দিষ্ট ইউজারের বুকিং ফিল্টার করে দেখা
app.get('/bookings', async (req, res) => {
  try {
    const database = client.db("ticketBariDB");
    const bookingsCollection = database.collection("bookings");
    
    let query = {};
    if (req.query.email) {
      query = { email: req.query.email }; // ইমেইল ফিল্টারিং লজিক
    }
    
    const result = await bookingsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error fetching bookings", error });
  }
});

app.get('/transports', async (req, res) => {
  try {
    const { category, from, to, date } = req.query;
    let query = {};
    
    if (category) query.category = category;
    
    // ফ্রন্টএন্ড থেকে সার্চ করা হলে এই ফিল্টারগুলো কুয়েরিতে যোগ হবে
    if (from && from !== "Select Terminal" && from !== "Select Station" && from !== "Select Airport") {
      query.from = from; 
    }
    if (to && to !== "Select Terminal" && to !== "Select Station" && to !== "Select Airport") {
      query.to = to;
    }
    // আপনার ডাটাবেজে যদি date ফিল্ড থাকে তবে এটিও অন করতে পারেন:
    // if (date) query.date = date;

    const result = await transportsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error fetching transports data", error });
  }
});

// 🗑️ DELETE BOOKING: টিকিট ক্যানসেল করার API
app.delete('/bookings/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const database = client.db("ticketBariDB");
    const bookingsCollection = database.collection("bookings");
    
    const query = { _id: new ObjectId(id) };
    const result = await bookingsCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete log node", error });
  }
});