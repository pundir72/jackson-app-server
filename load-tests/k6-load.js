import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 10 },
    { duration: "5m", target: 25 },
    { duration: "2m", target: 0 },
  ],
};

const baseUrl = __ENV.BASE_URL || "http://localhost:4001";

export default function () {
  const res = http.get(`${baseUrl}/health`);
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(1);
}
