// src/pages/OAuth2Callback.tsx
// Route FE cần thêm, ví dụ: <Route path="/oauth2/callback" element={<OAuth2Callback />} />
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setAccessToken } from "@/api/client";
import { fetchMe } from "@/api/auth";

export default function OAuth2Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      navigate("/login?error=missing_token");
      return;
    }

    setAccessToken(token);
    fetchMe()
      .then(() => navigate("/"))
      .catch(() => navigate("/login?error=session"));
  }, [navigate]);

  return <p>Đang đăng nhập...</p>;
}
