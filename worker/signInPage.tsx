/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';

interface SignInPageProps {
  clientId: string;
  loginUri: string;
}

export const VietnameseSignInPage: FC<SignInPageProps> = ({ clientId, loginUri }) => {
  return (
    <html lang="vi">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Đăng nhập — Sổ Tay Nhanh</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
          }
          .card {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 20px;
            padding: 32px 24px;
            box-shadow: 0 10px 30px -12px rgba(15, 23, 42, 0.08);
            text-align: center;
          }
          .logo {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: #22c55e;
            color: #ffffff;
            font-weight: 700;
            font-size: 20px;
            margin-bottom: 16px;
          }
          h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
          p { font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px; }
          .gsi-wrap { display: flex; justify-content: center; min-height: 44px; }
          .back {
            display: inline-block;
            margin-top: 20px;
            font-size: 13px;
            color: #64748b;
            text-decoration: none;
          }
          .back:hover { color: #16a34a; text-decoration: underline; }
        `}</style>
      </head>
      <body>
        <main class="card">
          <div class="logo">ST</div>
          <h1>Đăng nhập Sổ Tay Nhanh</h1>
          <p>Sử dụng tài khoản Gmail của bạn để lưu và đồng bộ ghi chú cá nhân an toàn.</p>
          <div class="gsi-wrap">
            <div
              id="g_id_onload"
              data-client_id={clientId}
              data-context="signin"
              data-ux_mode="redirect"
              data-login_uri={loginUri}
              data-auto_prompt="false"
            />
            <div
              class="g_id_signin"
              data-type="standard"
              data-shape="rectangular"
              data-theme="outline"
              data-text="signin_with"
              data-size="large"
              data-logo_alignment="left"
              data-locale="vi"
            />
          </div>
          <a class="back" href="/">Quay lại trang chủ</a>
        </main>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </body>
    </html>
  );
};
