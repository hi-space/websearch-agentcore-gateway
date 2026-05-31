import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 상위에 package-lock.json이 있어 Next가 workspace root를 잘못 추론하는 것을 방지.
  // 실제 프로젝트 root는 이 dashboard 디렉터리다.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
