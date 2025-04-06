import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";

export const useUserStore = create((set) => ({
  user: null,
  loading: false,
  checkingAuth: true,

  signup: async ({ name, email, password, confirmPassword }) => {
    set({ loading: true });
    if (password !== confirmPassword) {
      set({ loading: false });
      return toast.error("Passwords do not match");
    }
    try {
      const res = await axios.post("/auth/signup", { name, email, password });
      set({ user: res.data, loading: false });
    } catch (error) {
      set({ loading: false });
      toast.error(error.response?.data?.message || "An error occurred");
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await axios.post("/auth/login", { email, password });
      set({ user: res.data, loading: false });
    } catch (error) {
      set({ loading: false });
      toast.error(error.response?.data?.message || "An error occurred");
    }
  },

  logout: async () => {
    try {
      await axios.post("/auth/logout");
      set({ user: null });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "An error occurred during logout"
      );
    }
  },

  checkAuth: async () => {
    set({ checkingAuth: true });
    try {
      const response = await axios.get("/auth/profile");
      set({ user: response.data, checkingAuth: false });
    } catch (error) {
      console.log(error.message);
      set({ checkingAuth: false, user: null });
    }
  },

  refreshToken: async () => {
    try {
      const response = await axios.post(
        "/auth/refresh-token",
        {},
        {
          // Disable automatic retry for refresh token request
          __disableRetry: true,
        }
      );

      // Update user with new tokens
      set({
        user: response.data,
        checkingAuth: false,
      });

      return response.data;
    } catch (error) {
      // Logout user if refresh fails
      set({ user: null, checkingAuth: false });
      throw error;
    }
  },
}));

// Create a custom axios instance with improved interceptors
const setupAxiosInterceptors = (axiosInstance) => {
  let isRefreshing = false;
  let failedQueue = [];

  const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });

    failedQueue = [];
  };

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Prevent retry loop for refresh token request
      if (originalRequest.__disableRetry) {
        return Promise.reject(error);
      }

      // Check if the error is due to an unauthorized request
      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // If a refresh is already in progress, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers["Authorization"] = `Bearer ${token}`;
              return axiosInstance(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Attempt to refresh the token
          const userStore = useUserStore.getState();
          const newTokenData = await userStore.refreshToken();

          // Update Authorization header for original and queued requests
          originalRequest.headers[
            "Authorization"
          ] = `Bearer ${newTokenData.accessToken}`;

          // Process any queued requests
          processQueue(null, newTokenData.accessToken);

          return axiosInstance(originalRequest);
        } catch (refreshError) {
          // Logout user if refresh fails
          processQueue(refreshError, null);
          useUserStore.getState().logout();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );

  return axiosInstance;
};

// Setup the interceptors on the axios instance
setupAxiosInterceptors(axios);
