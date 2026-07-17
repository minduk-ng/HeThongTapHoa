<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:'Segoe UI',Roboto,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr>
            <td align="center">
                <table width="420" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; padding:40px; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                        <td align="center" style="padding-bottom:24px;">
                            <h1 style="margin:0; font-size:22px; color:#1e293b;">
                                {{ config('app.name') }}
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom:16px;">
                            <p style="margin:0; font-size:15px; color:#64748b;">
                                @if($type === 'signup')
                                    Mã xác thực để hoàn tất đăng ký tài khoản của bạn:
                                @else
                                    Mã xác thực để đổi mật khẩu của bạn:
                                @endif
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:24px 0;">
                            <div style="display:inline-block; background:linear-gradient(135deg,#6366f1,#8b5cf6); border-radius:12px; padding:16px 40px;">
                                <span style="font-size:32px; font-weight:700; color:#ffffff; letter-spacing:8px;">
                                    {{ $otpCode }}
                                </span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-top:16px;">
                            <p style="margin:0; font-size:13px; color:#94a3b8;">
                                Mã có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này với bất kỳ ai.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
