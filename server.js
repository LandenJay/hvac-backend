// server.js (NO sqlite / NO db) — in-memory bookings

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const { createEvent } = require("ics");

const app = express();

/**
 * ✅ CORS
 * For now allow all origins. Later: replace "*" with your domain (recommended).
 */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(bodyParser.json());

/**
 * ✅ ENV VARS (set these in Render > Environment)
 * EMAIL_USER = your gmail address
 * EMAIL_PASS = your Gmail App Password
 * RECEIVE_EMAIL = optional - where business notifications go (defaults to EMAIL_USER)
 */
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RECEIVE_EMAIL = process.env.RECEIVE_EMAIL || EMAIL_USER;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn("⚠️ WARNING: EMAIL_USER and/or EMAIL_PASS are not set in env vars.");
}

/**
 * ✅ Temporary in-memory bookings store
 * Structure:
 * bookedAppointments["2026-01-27"] = ["09:00", "11:00"]
 */
const bookedAppointments = {};

/**
 * ✅ Helper: parse "HH:MM" into numbers
 */
function parseTimeHHMM(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return { hh, mm };
}

/**
 * ✅ Helper: generate slot list for a date (edit times as you want)
 * Returns [{ label, value }]
 */
function getSlotListForDate(dateStr) {
  // You can customize these times
  return [
    { label: "8:00 AM", value: "08:00" },
    { label: "9:00 AM", value: "09:00" },
    { label: "10:00 AM", value: "10:00" },
    { label: "11:00 AM", value: "11:00" },
    { label: "12:00 PM", value: "12:00" },
    { label: "1:00 PM", value: "13:00" },
    { label: "2:00 PM", value: "14:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "4:00 PM", value: "16:00" },
  ];
}

/**
 * ✅ Sanity routes
 */
app.get("/", (req, res) => {
  res.status(200).send("✅ HVAC backend is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * ✅ Availability endpoint
 * GET /availability?date=YYYY-MM-DD
 */
app.get("/availability", (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    if (!date) {
      return res.status(400).json({ success: false, message: "Missing date" });
    }

    const possible = getSlotListForDate(date);
    const bookedForDate = bookedAppointments[date] || [];

    const available = possible.filter((slot) => !bookedForDate.includes(slot.value));

    return res.json({
      success: true,
      date,
      available, // [{label,value}]
    });
  } catch (err) {
    console.error("Availability error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * ✅ Book endpoint
 * POST /book
 * body: { date, time, name, email, phone, address }
 */
app.post("/book", async (req, res) => {
  try {
    const { date, time, name, email, phone, address, details } = req.body;

    if (!date || !time || !name || !email || !phone || !address || !details) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // prevent double booking (in-memory)
    bookedAppointments[date] = bookedAppointments[date] || [];
    if (bookedAppointments[date].includes(time)) {
      return res.status(409).json({
        success: false,
        message: "That time is already booked.",
      });
    }

    bookedAppointments[date].push(time);

    // Create calendar invite (.ics)
    const [year, month, day] = date.split("-").map(Number);
    const { hh, mm } = parseTimeHHMM(time);

    // appointment length (minutes)
    const durationMinutes = 60;

    const event = {
      title: "HVAC Appointment - J&L Climate Co.",
      description: `Appointment for ${name}\nPhone: ${phone}\nAddress: ${address}\nEmail: ${email}\n\nService Details:\n${details}`,
      start: [year, month, day, hh, mm],
      duration: { minutes: durationMinutes },
      status: "CONFIRMED",
      organizer: { name: "J&L Climate Co.", email: EMAIL_USER || "no-reply@example.com" },
      attendees: [{ name, email }],
    };

    // Setup mail transport
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    // build ICS content
    createEvent(event, async (error, value) => {
      if (error) {
        console.error("ICS error:", error);
        return res.status(500).json({ success: false, message: "Calendar invite failed" });
      }

      const customerMail = {
        from: EMAIL_USER,
        to: email,
        subject: "✅ Appointment Confirmed - J&L Climate Co.",
        text: `Hi ${name},\n\nYour appointment is confirmed for ${date} at ${time}.\n\nAddress: ${address}\nPhone: ${phone}\n\nService Details:\n${details}\n\nThanks,\nJ&L Climate Co.`,
        icalEvent: {
          filename: "appointment.ics",
          method: "REQUEST",
          content: value,
        },
      };

      const businessMail = {
  from: EMAIL_USER,
  to: RECEIVE_EMAIL, // your business receiving email
  subject: "📌 New Booking Received (Calendar Invite Attached)",
  text: `New booking:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nDate: ${date}\nTime: ${time}\n\nService Details:\n${details}`,

  icalEvent: {
    filename: "appointment.ics",
    method: "REQUEST",
    content: value,
  },
};


      try {
        if (EMAIL_USER && EMAIL_PASS) {
          await transporter.sendMail(customerMail);
          await transporter.sendMail(businessMail);
        } else {
          console.warn("Skipping emails because EMAIL env vars are missing.");
        }

        return res.json({ success: true, message: "Booked & invite emailed" });
      } catch (mailErr) {
        console.error("Mail error:", mailErr);
        return res.status(500).json({ success: false, message: "Booking created but email failed" });
      }
    });
  } catch (err) {
    console.error("Book error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * ✅ Render PORT binding
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
