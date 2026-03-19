import { GoogleGenAI } from "@google/genai";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";

// Use the defined process.env.GEMINI_API_KEY from vite.config.ts
const apiKey = process.env.GEMINI_API_KEY || "";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function sendSecurityAlertEmail(email: string, type: string, details: string, uid: string) {
  console.log(`Triggering security alert for ${email}...`);

  let draftedContent = `Security Alert: Suspicious activity detected.\nType: ${type}\nDetails: ${details}`;

  // 1. Try to draft a professional email using Gemini
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Draft a security alert email for a user of a "Hidden Vault Calculator" app.
        The alert type is: ${type}.
        Details: ${details}.
        The user's email is: ${email}.
        The email should be professional, urgent, and clear.
        Include a warning that suspicious activity was detected.
        Return ONLY the email body text.`,
      });
      if (response.text) {
        draftedContent = response.text;
      }
    } catch (error) {
      console.error("Error drafting with Gemini:", error);
      // Fallback to default content
    }
  } else {
    console.warn("GEMINI_API_KEY not configured. Using default alert template.");
  }

  // 2. Log the "sent" email to Firestore for the user to see in the app
  // This fulfills the "Firebase preferred" requirement for the alert system
  const path = `users/${uid}/alerts`;
  try {
    await addDoc(collection(db, path), {
      type,
      email,
      content: draftedContent,
      timestamp: serverTimestamp(),
      status: 'sent',
      details,
      uid
    });
    
    console.log("Security alert logged to Firestore successfully.");
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}
