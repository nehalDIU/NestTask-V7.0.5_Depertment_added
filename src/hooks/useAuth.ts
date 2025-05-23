import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { loginUser, signupUser, logoutUser, resetPassword } from '../services/auth.service';
import type { User, LoginCredentials, SignupCredentials } from '../types/auth';

// LocalStorage key for saved credentials
const REMEMBER_ME_KEY = 'nesttask_remember_me';
const SAVED_EMAIL_KEY = 'nesttask_saved_email';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  useEffect(() => {
    // Load saved email from local storage if it exists
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
    if (savedEmail) {
      setSavedEmail(savedEmail);
    }
    
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await updateUserState(session.user);
      }
    } catch (err) {
      console.error('Session check error:', err);
      setError('Failed to check authentication status');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthChange = async (_event: string, session: any) => {
    if (session?.user) {
      await updateUserState(session.user);
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  const updateUserState = async (authUser: any) => {
    try {
      // Add debugging logs
      console.log('Auth user from Supabase:', authUser);
      console.log('User metadata:', authUser.user_metadata);
      console.log('Role from metadata:', authUser.user_metadata?.role);
      
      // Get user data from the public.users table to ensure we have accurate role information
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
        
      console.log('User data from database:', userData);
      
      if (userError) {
        console.error('Error fetching user data:', userError);
      }
      
      // Determine the correct role, prioritizing the database role if available
      const role = userData?.role || authUser.user_metadata?.role || 'user';
      console.log('Final determined role:', role);
      
      setUser({
        id: authUser.id,
        email: authUser.email!,
        name: authUser.user_metadata?.name || userData?.name || authUser.email?.split('@')[0] || '',
        role: role as 'user' | 'admin' | 'super-admin',
        createdAt: authUser.created_at,
        avatar: userData?.avatar,
        phone: userData?.phone || authUser.user_metadata?.phone,
        studentId: userData?.student_id || authUser.user_metadata?.studentId,
        departmentId: userData?.department_id || authUser.user_metadata?.departmentId,
        batchId: userData?.batch_id || authUser.user_metadata?.batchId,
        sectionId: userData?.section_id || authUser.user_metadata?.sectionId
      });
    } catch (err) {
      console.error('Error updating user state:', err);
      setError('Failed to update user information');
    }
  };

  const login = async (credentials: LoginCredentials, rememberMe: boolean = false) => {
    try {
      setError(null);
      
      // Handle "Remember me" option
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
        localStorage.setItem(SAVED_EMAIL_KEY, credentials.email);
      } else {
        // Clear saved credentials if "Remember me" is not checked
        localStorage.removeItem(REMEMBER_ME_KEY);
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
      
      // Get the authenticated user from the auth service
      const user = await loginUser(credentials);
      console.log('User after login:', user);
      
      // Double-check the user's role from the database
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (userError) {
        console.error('Error fetching user data after login:', userError);
      } else {
        console.log('User data from database after login:', userData);
        // Update the user with the correct data from the database
        if (userData) {
          // Update role
          if (userData.role) {
            user.role = userData.role as 'user' | 'admin' | 'super-admin';
            console.log('Updated user role from database:', user.role);
          }
          
          // Update department, batch, and section information
          if (userData.department_id) {
            user.departmentId = userData.department_id;
            console.log('Updated user department ID:', user.departmentId);
          }
          
          if (userData.batch_id) {
            user.batchId = userData.batch_id;
            console.log('Updated user batch ID:', user.batchId);
          }
          
          if (userData.section_id) {
            user.sectionId = userData.section_id;
            console.log('Updated user section ID:', user.sectionId);
          }
          
          if (userData.phone) {
            user.phone = userData.phone;
          }
          
          if (userData.student_id) {
            user.studentId = userData.student_id;
          }
          
          if (userData.avatar) {
            user.avatar = userData.avatar;
          }
        }
      }
      
      setUser(user);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (credentials: SignupCredentials) => {
    try {
      setError(null);
      console.log('Starting signup process with credentials:', {
        ...credentials,
        password: '[REDACTED]' // Don't log the password
      });
      
      // Validate department, batch, and section if provided
      if (credentials.departmentId) {
        console.log(`Department selected: ${credentials.departmentId}`);
      }
      if (credentials.batchId) {
        console.log(`Batch selected: ${credentials.batchId}`);
      }
      if (credentials.sectionId) {
        console.log(`Section selected: ${credentials.sectionId}`);
      }
      
      const user = await signupUser(credentials);
      console.log('Signup successful, user data:', {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
        batchId: user.batchId,
        sectionId: user.sectionId
      });
      
      setUser(user);
      return user;
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      console.log('Starting logout process in useAuth hook...');
      setError(null);
      
      // Clear user state first for immediate UI feedback
      setUser(null);
      
      // Call the API logout function
      await logoutUser();
      
      console.log('Logout API call successful');
      
      // Keep the saved email if "Remember me" was checked
      if (localStorage.getItem(REMEMBER_ME_KEY) !== 'true') {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
      
      // Force clear localStorage items related to authentication
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('nesttask_user');
      
      // Clear any session cookies by setting expiration in the past
      document.cookie.split(";").forEach(function(c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      
      console.log('Logout process completed');
      
      return true; // Return success
    } catch (err: any) {
      console.error('Logout error in useAuth:', err);
      setError(err.message);
      throw err;
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      setError(null);
      await resetPassword(email);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return {
    user,
    loading,
    error,
    login,
    signup,
    logout,
    forgotPassword,
    savedEmail,
  };
}
