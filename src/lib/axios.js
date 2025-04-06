import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "https://store-api-three-iota.vercel.app",
  withCredentials: true, // send cookies to the server
});

export default axiosInstance;
