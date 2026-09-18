<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmailChangeAlert extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $oldEmail,
        public string $newEmail,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Email tài khoản của bạn đã được thay đổi');
    }

    public function content(): Content
    {
        return new Content(htmlString: sprintf(
            '<p>Email đăng nhập của tài khoản %s vừa được đổi thành %s. Nếu không phải bạn thực hiện, hãy liên hệ quản trị viên ngay.</p>',
            e($this->oldEmail),
            e($this->newEmail),
        ));
    }
}
