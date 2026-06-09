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

    // 🕵️‍♂️ ADMIN CHECK ROUTE
    app.get('/users/admin/:email', async (req, res) => {
      try {
        const email = req.params.email;
        if (email === 'admin@gmail.com') {
          return res.send({ admin: true });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        res.send({ admin: user?.role === 'admin' });
      } catch (error) {
        res.status(500).send({ message: "Admin check failure", error });
      }
    });

    // 🚌 TRANSPORTS ROUTE (১০০% ফুল-প্রুফ সার্চ ফিল্টারিং)
    app.get('/transports', async (req, res) => {
      try {
        const { category, from, to, limit } = req.query;
        let query = {};
        
        // 🎯 ফিক্সড: ক্যাটাগরিকেও কেস-ইনসেন্সিটিভ করা হলো (Bus/bus দুইটাই কাজ করবে)
        if (category) {
          query.category = { $regex: `^${category}$`, $options: 'i' };
        }
        
        // 🎯 ফিক্সড: রুট লোকেশন লুজ সার্চ
        if (from && from !== "Select Location") {
          query.from = { $regex: from.trim(), $options: 'i' }; 
        }
        if (to && to !== "Select Location") {
          query.to = { $regex: to.trim(), $options: 'i' };
        }

        // আপনার নোড কনসোলে কুয়েরি অবজেক্ট প্রিন্ট হবে (চেক করার জন্য)
        console.log("Database Executing Query:", query);

        let cursor = transportsCollection.find(query);
        
        if (limit) {
          cursor = cursor.limit(parseInt(limit));
        }

        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching transports data", error });
      }
    });

    // 🎯 SINGLE TRANSPORT DETAILS
    app.get('/transports/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await transportsCollection.findOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching single transport details", error });
      }
    });

    // 🎟️ TICKET BOOKING ROUTE
    app.post('/bookings', async (req, res) => {
      try {
        const bookingData = req.body;
        
        const transportQuery = { _id: new ObjectId(bookingData.transportId) };
        const transport = await transportsCollection.findOne(transportQuery);
        
        if (!transport) {
          return res.status(404).send({ success: false, message: "Transport node not found" });
        }

        const seatsToBook = Number(bookingData.totalPassengers) || 1;
        if (transport.availableSeats < seatsToBook) {
          return res.status(400).send({ success: false, message: "Not enough available seats left!" });
        }

        const result = await bookingsCollection.insertOne(bookingData);

        await transportsCollection.updateOne(transportQuery, {
          $inc: { availableSeats: -seatsToBook }
        });

        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, message: "Booking transactional failure", error });
      }
    });

    // 🔍 GET BOOKINGS BY EMAIL
    app.get('/bookings', async (req, res) => {
      try {
        let query = {};
        if (req.query.email) {
          query = { email: req.query.email };
        }
        const result = await bookingsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching user bookings", error });
      }
    });

    // 🗑️ DELETE BOOKING
    app.delete('/bookings/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const bookingQuery = { _id: new ObjectId(id) };
        
        const booking = await bookingsCollection.findOne(bookingQuery);
        if (!booking) {
          return res.status(404).send({ message: "Booking data node not found" });
        }

        const result = await bookingsCollection.deleteOne(bookingQuery);

        if (booking.transportId) {
          const seatToRestore = Number(booking.totalPassengers) || 1;
          await transportsCollection.updateOne(
            { _id: new ObjectId(booking.transportId) },
            { $inc: { availableSeats: seatToRestore } }
          );
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete log node or revert seats", error });
      }
    });

    // 🔒 SECURE ADMIN PANEL ROUTES
    app.get('/admin/bookings', async (req, res) => {
      try {
        const email = req.query.email;
        if (email !== 'admin@gmail.com') {
          const user = await usersCollection.findOne({ email: email });
          if (user?.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden Access!' });
          }
        }
        const result = await bookingsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error compiling live booking manifest", error });
      }
    });

    app.get('/admin/stats', async (req, res) => {
      try {
        const email = req.query.email;
        if (email !== 'admin@gmail.com') {
          const user = await usersCollection.findOne({ email: email });
          if (user?.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden Access!' });
          }
        }

        const totalBookings = await bookingsCollection.countDocuments();
        const totalUsers = await usersCollection.countDocuments();
        
        const busTickets = await bookingsCollection.countDocuments({ transportType: 'bus' });
        const trainTickets = await bookingsCollection.countDocuments({ transportType: 'train' });
        const launchTickets = await bookingsCollection.countDocuments({ transportType: 'launch' });

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
      } catch (error) {
        res.status(500).send({ message: "Analytics processing node failure", error });
      }
    });

  } catch (error) {
    console.error("Database initialization error:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Ticket Bari Server Engine is Running Successfully...');
});

app.listen(port, () => {
  console.log(`Server running smoothly on port ${port}`);
});
export default app;