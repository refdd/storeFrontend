import axios from "../lib/axios";
import { useUserStore } from "../stores/useUserStore";

// Centralized function to handle token refresh
const handleTokenRefresh = async () => {
  try {
    const userStore = useUserStore.getState();
    await userStore.refreshToken();
    return true;
  } catch (error) {
    console.error("Token refresh failed:", error);
    useUserStore.getState().logout();
    window.location.href = "/login";
    return false;
  }
};

// Configure axios interceptors
export const setupAxiosInterceptors = () => {
  // Response interceptor
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Check if it's a 401 error and we haven't already tried to refresh
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        // Attempt to refresh the token
        const refreshed = await handleTokenRefresh();

        if (refreshed) {
          // Retry the original request
          return axios(originalRequest);
        }
      }

      // If refresh fails or it's not a 401, reject the promise
      return Promise.reject(error);
    }
  );

  // Request interceptor to handle global loading state
  axios.interceptors.request.use(
    (config) => {
      const userStore = useUserStore.getState();

      // Optional: Set loading state for certain requests
      if (config.url.includes("/profile")) {
        userStore.set({ checkingAuth: true });
      }

      return config;
    },
    (error) => {
      const userStore = useUserStore.getState();
      userStore.set({ checkingAuth: false });
      return Promise.reject(error);
    }
  );
};
