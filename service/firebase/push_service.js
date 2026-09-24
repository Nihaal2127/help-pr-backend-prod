const admin = require("firebase-admin");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION,
});

const FIREBASE_APP_TARGETS = {
  customer: {
    appName: "helppr-customer",
    expectedProjectId: "helper-user-app",
    expectedSenderId: "637181315442",
    secretName: "help-pr/firebase/adminsdk-customer",
  },

  partner: {
    appName: "helppr-partner",
    expectedProjectId: null,
    expectedSenderId: null,
    secretName: "help-pr/firebase/adminsdk-partner",
  },
};

const readyApps = new Set();
const appMetadata = {};

/**
 * Load Firebase service account from AWS Secrets Manager
 */
const loadServiceAccount = async (secretName) => {
  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      console.error(
        `[firebase] secret ${secretName} does not contain SecretString`
      );
      return null;
    }

    const serviceAccount = JSON.parse(response.SecretString);

    if (!serviceAccount?.project_id || !serviceAccount?.private_key) {
      console.error(
        `[firebase] invalid service account secret ${secretName} (missing project_id/private_key)`
      );
      return null;
    }

    return serviceAccount;
  } catch (error) {
    console.error(
      `[firebase] failed to load secret ${secretName}:`,
      error.message || error
    );

    return null;
  }
};

/**
 * Initialize Firebase app from AWS Secrets Manager
 */
const initFirebaseApp = async (target) => {
  const config = FIREBASE_APP_TARGETS[target];

  if (!config) {
    return false;
  }

  const serviceAccount = await loadServiceAccount(config.secretName);

  if (!serviceAccount) {
    appMetadata[target] = {
      ready: false,
      projectId: null,
      clientEmail: null,
      sourceSecret: config.secretName,
      expectedProjectId: config.expectedProjectId,
      expectedSenderId: config.expectedSenderId,
      projectMatchesCustomerApp: null,
    };

    return false;
  }

  try {
    admin.initializeApp(
      {
        credential: admin.credential.cert(serviceAccount),
      },
      config.appName
    );

    readyApps.add(target);

    appMetadata[target] = {
      ready: true,
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email || null,
      sourceSecret: config.secretName,
      expectedProjectId: config.expectedProjectId,
      expectedSenderId: config.expectedSenderId,

      projectMatchesCustomerApp:
        config.expectedProjectId == null
          ? null
          : serviceAccount.project_id === config.expectedProjectId,
    };

    console.log(
      `[firebase] ${target} push initialized from secret ${config.secretName} project_id=${serviceAccount.project_id}`
    );

    return true;
  } catch (error) {
    if (error?.code === "app/duplicate-app") {
      readyApps.add(target);
      return true;
    }

    console.error(
      `[firebase] failed to initialize ${target} from secret ${config.secretName}:`,
      error.message || error
    );

    return false;
  }
};

/**
 * Initialize both Firebase applications.
 *
 * Lambda may load this module before the first request,
 * so we keep the initialization promise and wait for it
 * inside sendPushNotification().
 */
const firebaseInitializationPromise = Promise.all(
  Object.keys(FIREBASE_APP_TARGETS).map((target) =>
    initFirebaseApp(target)
  )
).then(() => {
  if (!readyApps.size) {
    console.warn(
      "Firebase service account secrets were not loaded. Push notifications are disabled."
    );
  }
});

/**
 * Resolve Firebase target
 */
const resolveFirebaseTarget = (target) => {
  const normalized = String(target || "")
    .trim()
    .toLowerCase();

  if (normalized === "customer" || normalized === "user") {
    return "customer";
  }

  if (normalized === "partner") {
    return "partner";
  }

  return null;
};

/**
 * Firebase diagnostics
 */
const getFirebaseDiagnostics = () => ({
  customer: appMetadata.customer || {
    ready: readyApps.has("customer"),
  },

  partner: appMetadata.partner || {
    ready: readyApps.has("partner"),
  },

  customerAppReference: {
    projectId: "helper-user-app",
    senderId: "637181315442",
    androidPackage: "com.helppr",
  },

  hint:
    "messaging/mismatched-credential means the deviceToken was issued by a different Firebase project than the loaded service account. Customer tokens require project_id helper-user-app (sender 637181315442).",
});

/**
 * Send Firebase push notification
 */
const sendPushNotification = async ({
  deviceToken,
  title,
  body,
  data = {},
  target = "customer",
}) => {
  // Make sure Firebase initialization has completed
  await firebaseInitializationPromise;

  const firebaseTarget = resolveFirebaseTarget(target);

  if (!firebaseTarget || !readyApps.has(firebaseTarget)) {
    const expectedSecret =
      firebaseTarget === "partner"
        ? "help-pr/firebase/adminsdk-partner"
        : "help-pr/firebase/adminsdk-customer";

    throw new Error(
      `Firebase is not configured for ${
        firebaseTarget || target
      }. Unable to load secret ${expectedSecret}.`
    );
  }

  const appName = FIREBASE_APP_TARGETS[firebaseTarget].appName;

  const message = {
    token: deviceToken,

    notification: {
      title,
      body,
    },

    data: {
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      ...data,
    },

    android: {
      priority: "high",
    },

    apns: {
      payload: {
        aps: {
          sound: "default",
          contentAvailable: true,
        },
      },
    },
  };

  const response = await admin
    .app(appName)
    .messaging()
    .send(message);

  console.log(
    `Successfully sent ${firebaseTarget} message:`,
    response
  );

  return response;
};

/**
 * Safe push notification wrapper
 */
const safeSendPushNotification = async (payload) => {
  try {
    const messageId = await sendPushNotification(payload);

    return {
      ok: true,
      messageId: messageId || null,
    };
  } catch (error) {
    console.error(
      "Push notification failed:",
      error.message || error
    );

    return {
      ok: false,
      error: error.message || String(error),
      code: error.code || error.errorInfo?.code || null,
    };
  }
};

/**
 * Map user type to Firebase target
 */
const mapUserTypeToFirebaseTarget = (userType) => {
  switch (Number(userType)) {
    case 4:
      return "customer";

    case 2:
      return "partner";

    default:
      return null;
  }
};

module.exports = {
  sendPushNotification,
  safeSendPushNotification,
  mapUserTypeToFirebaseTarget,
  getFirebaseDiagnostics,
};