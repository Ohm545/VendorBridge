/**
 * Firebase Authentication Frontend Integration
 */

// Firebase configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "earlycustomer-9193a.firebaseapp.com",
  projectId: "earlycustomer-9193a",
  storageBucket: "earlycustomer-9193a.appspot.com",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};

// Initialize Firebase (if not already done)
let auth;
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Firebase Auth Service
class FirebaseAuthService {
  
  // Sign up with email/password
  async signUp(email, password, displayName) {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      
      // Update display name
      if (displayName) {
        await userCredential.user.updateProfile({
          displayName: displayName
        });
      }

      return await this.syncWithBackend(userCredential.user);
    } catch (error) {
      console.error('Firebase signup error:', error);
      throw this.handleFirebaseError(error);
    }
  }

  // Sign in with email/password
  async signIn(email, password) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      return await this.syncWithBackend(userCredential.user);
    } catch (error) {
      console.error('Firebase signin error:', error);
      throw this.handleFirebaseError(error);
    }
  }

  // Sign in with Google
  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      
      const userCredential = await auth.signInWithPopup(provider);
      return await this.syncWithBackend(userCredential.user);
    } catch (error) {
      console.error('Firebase Google signin error:', error);
      throw this.handleFirebaseError(error);
    }
  }

  // Sign out
  async signOut() {
    try {
      await auth.signOut();
      // Clear local token
      document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      window.location.href = '/pages/login.html';
    } catch (error) {
      console.error('Firebase signout error:', error);
      throw error;
    }
  }

  // Sync Firebase user with backend
  async syncWithBackend(firebaseUser) {
    try {
      const idToken = await firebaseUser.getIdToken();
      
      const response = await fetch('/auth/firebase/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken })
      });

      const result = await response.json();

      if (result.success) {
        // Redirect based on user role
        if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        }
        return result.user;
      } else {
        throw new Error(result.message || 'Backend sync failed');
      }
    } catch (error) {
      console.error('Backend sync error:', error);
      throw error;
    }
  }

  // Monitor auth state changes
  onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
  }

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  }

  // Send email verification
  async sendEmailVerification() {
    try {
      const user = auth.currentUser;
      if (user) {
        await user.sendEmailVerification();
        return true;
      }
      throw new Error('No user signed in');
    } catch (error) {
      console.error('Send email verification error:', error);
      throw error;
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      return true;
    } catch (error) {
      console.error('Password reset error:', error);
      throw this.handleFirebaseError(error);
    }
  }

  // Handle Firebase errors
  handleFirebaseError(error) {
    const errorMap = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password is too weak.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.',
      'auth/cancelled-popup-request': 'Only one popup request is allowed at a time.',
    };

    const friendlyMessage = errorMap[error.code] || error.message || 'An error occurred during authentication.';
    return new Error(friendlyMessage);
  }
}

// Global instance
const firebaseAuth = new FirebaseAuthService();

// Utility functions for forms
function showFirebaseError(containerId, message) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="alert alert-error">${message}</div>`;
    container.style.display = 'block';
  }
}

function showFirebaseSuccess(containerId, message) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="alert alert-success">${message}</div>`;
    container.style.display = 'block';
  }
}

function hideFirebaseMessage(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.style.display = 'none';
  }
}

// Auto-redirect if user is already signed in
firebaseAuth.onAuthStateChanged((user) => {
  const currentPage = window.location.pathname;
  const authPages = ['/pages/login.html', '/pages/signup.html', '/pages/forgot-password.html'];
  
  if (user && user.emailVerified && authPages.includes(currentPage)) {
    // User is signed in and verified, sync with backend
    firebaseAuth.syncWithBackend(user).catch(console.error);
  }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseAuth;
}