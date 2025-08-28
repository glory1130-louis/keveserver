const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./models');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());



// Signup
app.post('/signup', async (req, res) => {
  const { fullname, email, password, phone } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.User.create({ fullname, email, password: hashedPassword, phone });
    res.json({ message: 'User created', user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db.User.findOne({ where: { email } });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post("/send-otp", async (req, res) => {
  const { email, phone, method } = req.body;
  if (!method) return res.status(400).json({ error: "Verification method required" });

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // valid for 5 minutes

  try {
    // Save OTP to DB
    await db.Otp.create({ email, phone, code: otp, expiresAt });

    // ===== EMAIL OTP using PrivateEmail =====
    if (method === "email") {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "mail.privateemail.com",
        port: process.env.SMTP_PORT || 587,
        secure: false, // STARTTLS
        auth: {
          user: process.env.SMTP_USERNAME || "admin@nyxcipher.ai",
          pass: process.env.SMTP_PASSWORD || "R!ti81!%ff!@",
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_USERNAME || "admin@nyxcipher.ai",
        to: email,
        subject: "Your Verification Code",
        text: `Your OTP is ${otp}. It expires in 5 minutes.`,
      });

      console.log(`📧 OTP sent to ${email}: ${otp}`);
    }

    // ===== PHONE OTP (simulated SMS) =====
    else if (method === "phone") {
      console.log(`📱 Simulated SMS to ${phone}: Your OTP is ${otp}`);
    }

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});


app.post("/verify-otp", async (req, res) => {
  const { email, phone, code } = req.body;
  try {
    let whereClause = {};

    if (email) {
      whereClause = { email };
    } else if (phone) {
      whereClause = { phone };
    } else {
      return res.status(400).json({ error: "Email or phone required" });
    }
    // Find latest OTP for this user
    const record = await db.Otp.findOne({
      where: { ...whereClause },
      order: [["createdAt", "DESC"]],
    });

    if (!record) return res.status(400).json({ error: "OTP not found" });

    if (record.code !== code) return res.status(400).json({ error: "Invalid OTP" });

    if (new Date() > record.expiresAt) return res.status(400).json({ error: "OTP expired" });

    // ✅ OTP is valid → delete it
    await record.destroy();

    res.json({ message: "OTP verified successfully", success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});


app.get("/payments", async (req, res) => {
  try {
    const payments = await db.Payment.findAll({ order: [['createdAt', 'DESC']] });
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Create new payment
app.post("/payments", async (req, res) => {
  try {
    const { billFor } = req.body;

    const newPayment = await db.Payment.create({
      date: new Date(),
      billFor,
      account: "ACC" + Math.floor(Math.random() * 10000),
      amount: (Math.random() * 100).toFixed(2),
      method: "Credit Card",
      status: "Success",
    });

    res.json(newPayment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

app.delete("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.Payment.destroy({ where: { id } });

    if (deleted) {
      res.json({ message: `Payment ${id} deleted successfully` });
    } else {
      res.status(404).json({ error: "Payment not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

// Update payment by id
app.put("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { billFor } = req.body;

    const payment = await db.Payment.findByPk(id);
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    payment.billFor = billFor || payment.billFor;
    await payment.save();

    res.json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
