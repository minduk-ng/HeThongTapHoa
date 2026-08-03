# Báo cáo kiểm tra bảo mật Superpowers trước khi cài đặt

**Nguồn:** https://github.com/obra/superpowers  
**Commit đã kiểm tra:** `44c9b2d6e889982ac18c27d05a19fefe335194e1`  
**Phiên bản manifest:** `6.2.0`  
**Phạm vi đề xuất cài:** chỉ cây `skills/` vào `.workbuddy-ai/skills/` của dự án. Không cài hook/plugin dành cho Claude Code, OpenCode, Pi, Cursor hay Codex.

## Kết luận

**Phân loại tổng thể: P1 — có hành vi cần người dùng chấp thuận rõ ràng trước khi cài.**

Không tìm thấy bằng chứng P0 như mã độc, đánh cắp bí mật, tải và thực thi payload từ xa, thay đổi quyền hệ thống hoặc cơ chế duy trì bí mật không được công bố. Tuy nhiên, gói skill có khả năng hướng agent thực hiện thao tác phá hủy Git/workspace, chạy tiến trình và lệnh hệ thống, mở local server, ghi/xóa file, tạo commit/worktree, và có một tùy chọn chạy shell command lấy từ biến môi trường. Vì skill là hướng dẫn có thể được agent thực thi về sau, các khả năng này được xếp P1 dù một số được giới hạn hoặc có cảnh báo.

**Không cài đặt đã được thực hiện tại thời điểm lập báo cáo.**

## Phạm vi đã rà soát

- Toàn bộ 14 tệp `skills/*/SKILL.md`.
- Các script thực thi nằm trong cây skill, đặc biệt:
  - `skills/subagent-driven-development/scripts/sdd-workspace`
  - `skills/subagent-driven-development/scripts/review-package`
  - `skills/subagent-driven-development/scripts/task-brief`
  - `skills/brainstorming/scripts/server.cjs`
  - `skills/brainstorming/scripts/start-server.sh`
  - `skills/brainstorming/scripts/stop-server.sh`
  - `skills/systematic-debugging/find-polluter.sh`
  - `skills/writing-skills/render-graphs.js`
- Tệp hỗ trợ, prompt reviewer/implementer, reference và asset nằm trong cây skill.
- Cơ chế tự động/persistence ngoài cây skill:
  - `hooks/session-start`, `hooks/run-hook.cmd`, `hooks/hooks.json`
  - `.opencode/plugins/superpowers.js`
  - `.pi/extensions/superpowers.ts`
- Quét toàn kho theo nhóm: destructive operations, command execution, network activity, credentials/secrets, hooks và persistence.

## Phát hiện P0

**Không phát hiện P0.**

Không thấy mã gửi API key/token ra ngoài, đọc kho bí mật của người dùng để exfiltrate, tự tải binary, tự nâng quyền, hay tự cài persistence vào WorkBuddy.

## Phát hiện P1

### P1-1 — Skill hướng dẫn thao tác phá hủy workspace/Git

- `skills/subagent-driven-development/SKILL.md` cảnh báo `git clean -fdx` sẽ phá hủy workspace, và ở bước kết thúc hướng dẫn `rm -rf <workspace>`.
- `skills/finishing-a-development-branch/SKILL.md` có luồng xóa worktree và force-delete branch (`git branch -D`) sau xác nhận từ người dùng.
- `skills/using-git-worktrees/SKILL.md` có thể tạo worktree, sửa `.gitignore`, tạo commit và cài dependencies.

Các lệnh này không tự chạy khi cài, nhưng agent có thể thực thi khi skill được kích hoạt. Dòng `rm -rf <workspace>` trong SDD là rủi ro cao hơn vì chỉ dựa vào controller truyền đúng đường dẫn. Luồng finishing branch an toàn hơn do yêu cầu xác nhận chính xác trước khi discard.

**Giảm thiểu đề xuất:** chỉ cài nếu người dùng chấp thuận; khi dùng trong WorkBuddy phải tuân theo confirmation/sandbox hiện có; không cho phép xóa ngoài `.superpowers/sdd/<plan>/` hoặc worktree do chính workflow tạo.

### P1-2 — Brainstorming có local HTTP/WebSocket server và khả năng chạy shell command

`skills/brainstorming/scripts/server.cjs`:

- Mở HTTP/WebSocket server; mặc định bind `127.0.0.1`, nhưng hỗ trợ `0.0.0.0` khi người vận hành chỉ định.
- Dùng session token 256-bit, cookie `HttpOnly; SameSite=Strict`, constant-time comparison, Origin check và giới hạn file phục vụ trong content directory.
- Ghi token/URL vào file owner-only trong `.superpowers/brainstorm`.
- Có tải ảnh thương hiệu từ `https://primeradiant.com/...` trừ khi telemetry/nonessential traffic bị vô hiệu hóa. Đây là request thụ động từ browser, có thể lộ IP và phiên bản qua query `?v=`.
- Khi `BRAINSTORM_OPEN_CMD` được đặt, dùng `child_process.exec(...)` với chuỗi lệnh từ biến môi trường. Đây là explicit operator override, nhưng vẫn là shell execution. Đường mặc định dùng `execFile` và không qua shell.

`start-server.sh` tạo process nền/foreground, file PID, token và log. `stop-server.sh` có `kill -9` và `rm -rf`, nhưng chỉ xóa thư mục khi tham số bắt đầu bằng `/tmp/*`; persistent project sessions được giữ lại.

**Giảm thiểu đề xuất:** không tự động khởi động visual companion; chỉ chạy sau khi người dùng đồng ý; giữ bind loopback; không đặt `BRAINSTORM_OPEN_CMD`; có thể vô hiệu hóa traffic thương hiệu bằng `SUPERPOWERS_DISABLE_TELEMETRY=1`; WorkBuddy đã có visualizer riêng nên có thể không dùng phần này.

### P1-3 — Các skill có thể thực thi lệnh hệ thống và thay đổi repo

- `systematic-debugging/find-polluter.sh` chạy `npm test` theo danh sách file; tham số file được quote, nhưng vòng lặp dùng word splitting nên đường dẫn có khoảng trắng không an toàn về tính đúng đắn.
- `writing-skills/render-graphs.js` chạy lệnh cố định `dot -Tsvg` và `which dot`; nội dung DOT được truyền qua stdin, không nối vào command string.
- `executing-plans`, `test-driven-development`, `verification-before-completion`, `writing-plans` và các workflow review hướng agent chạy test, build, Git và commit.

Đây là chức năng dự kiến của bộ coding workflow, không phải hành vi ẩn. Tuy nhiên nó mở rộng đáng kể quyền hành động khi agent tuân theo skill.

### P1-4 — Bootstrap hooks/plugins tự động chèn chỉ dẫn mạnh vào mọi session

- `hooks/session-start`, OpenCode plugin và Pi extension chèn `using-superpowers` vào context với marker `EXTREMELY_IMPORTANT`.
- `using-superpowers` yêu cầu bắt buộc kích hoạt skill trước gần như mọi phản hồi/hành động.

Đây là persistence ở cấp harness nếu cài toàn bộ plugin. Nó có thể xung đột với workflow, policy và cơ chế skill hiện hữu của WorkBuddy.

**Giảm thiểu đề xuất:** không sao chép `hooks/`, `.opencode/`, `.pi/`, `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/` hoặc manifest tích hợp. Chỉ cài các thư mục skill để WorkBuddy discovery xử lý tự nhiên.

## Phát hiện P2 / an toàn thông thường

- Ba script SDD validate số lượng tham số và sự tồn tại của plan; Git revisions được kiểm tra trước khi tạo diff.
- `sdd-workspace` giới hạn workspace theo basename của plan trong `<repo>/.superpowers/sdd/` và tự tạo `.gitignore` cục bộ.
- `review-package` chỉ đọc Git history/diff và ghi package vào workspace.
- `task-brief` chỉ đọc plan và ghi task brief.
- Brainstorm server có xác thực session, WebSocket Origin enforcement, symlink/hardlink containment checks, security headers, payload cap, idle shutdown và PID identity check trước khi kill.
- Không có dependency runtime bên ngoài cho server; dùng module built-in của Node.
- Không có network fetch chủ động từ agent/server ngoài logo do browser tải và liên kết tài liệu.
- Các API key trong docs/tests là placeholder hoặc tên biến môi trường; không có secret thật trong phạm vi đã rà soát.
- Phần lớn `rm -rf` và process spawning ngoài cây `skills/` nằm trong tests, packaging hoặc tài liệu phát triển upstream; chúng sẽ không được đưa vào cài đặt skill-only.

## Danh sách 14 skill upstream

1. `brainstorming`
2. `dispatching-parallel-agents`
3. `executing-plans`
4. `finishing-a-development-branch`
5. `receiving-code-review`
6. `requesting-code-review`
7. `subagent-driven-development`
8. `systematic-debugging`
9. `test-driven-development`
10. `using-git-worktrees`
11. `using-superpowers`
12. `verification-before-completion`
13. `writing-plans`
14. `writing-skills`

## Phương án cài đặt khuyến nghị

Nếu người dùng xác nhận chấp nhận P1:

1. Tạo `.workbuddy-ai/skills/` trong dự án.
2. Sao chép **chỉ** `skills/*` cùng supporting files để giữ các relative link.
3. Không cài hook/plugin/manifest upstream.
4. Thêm ghi chú thích nghi WorkBuddy cho hai workflow chính nếu cần, nhưng không thay đổi hành vi upstream không cần thiết:
   - WorkBuddy child agent dùng các profile `default`, `lite`, `reasoning` thay vì model ID cụ thể.
   - Nếu child-agent service tiếp tục trả HTTP 403, workflow phải báo BLOCKED hoặc dùng `executing-plans` inline; việc cài skill không sửa lỗi hạ tầng này.
   - Các lệnh destructive vẫn phải đi qua policy xác nhận của WorkBuddy.
5. Kiểm tra frontmatter và discovery cho cả 14 skill.
6. Thử load rõ ràng `subagent-driven-development` và `executing-plans`.

## Quyết định cần người dùng

Do có P1, cần xác nhận rõ ràng trước khi sao chép skill vào dự án. Lựa chọn an toàn nhất là:

- **Cài skill-only (khuyến nghị):** 14 thư mục trong `skills/`, không cài hooks/plugins; chấp nhận các khả năng Git/process/local-server nêu trên.
- **Cài tối thiểu:** chỉ workflow plan/SDD và các dependency tài liệu trực tiếp; giảm bề mặt rủi ro nhưng các cross-reference có thể thiếu.
- **Không cài:** giữ nguyên trạng thái hiện tại.
