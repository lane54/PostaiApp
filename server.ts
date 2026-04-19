import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import admin from "firebase-admin";
import fs from "fs";

// Load Firebase Config
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();

// Mercado Pago Setup
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || "APP_USR-3362908437212695-011221-de3e955ba551e3c106c94f3cbefdf50d-3099526508";
const client = new MercadoPagoConfig({ accessToken });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.post("/api/create-preference", async (req, res) => {
    const { plan, userId, userEmail } = req.body;

    const price = plan === 'pro' ? 29.90 : 49.90;
    const title = `PosteAI - Plano ${plan.toUpperCase()}`;

    try {
      const preApproval = new PreApproval(client);
      
      // Calculate start date (7 days from now)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7);
      
      const result = await preApproval.create({
        body: {
          reason: title,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: price,
            currency_id: 'BRL',
            start_date: startDate.toISOString(),
          },
          payer_email: userEmail,
          back_url: `${process.env.APP_URL || 'http://localhost:3000'}/?payment=success`,
          notification_url: `${process.env.APP_URL || 'http://localhost:3000'}/api/webhook`,
          external_reference: userId,
          status: 'pending'
        } as any
      });

      res.json({ id: result.id, init_point: result.init_point });
    } catch (error) {
      console.error("Mercado Pago Error:", error);
      res.status(500).json({ error: "Erro ao criar assinatura" });
    }
  });

  // Webhook for payment/subscription notifications
  app.post("/api/webhook", async (req, res) => {
    const { action, type, data } = req.body;

    // Handle both payments and subscriptions (pre-approvals)
    if (type === 'subscription' || type === 'preapproval' || action?.includes('subscription')) {
      const subscriptionId = data.id;
      
      try {
        const response = await fetch(`https://api.mercadopago.com/v1/preapproval/${subscriptionId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        const subData = await response.json();

        if (subData.status === 'authorized' || subData.status === 'active') {
          const userId = subData.external_reference;
          const plan = subData.reason.toLowerCase().includes('premium') ? 'premium' : 'pro';

          const userRef = db.collection('users').doc(userId);
          await userRef.set({ plan: plan }, { merge: true });
          console.log(`User ${userId} subscription activated: ${plan}`);
        }
      } catch (error) {
        console.error("Webhook Error:", error);
      }
    }

    res.status(200).send('OK');
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
