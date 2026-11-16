/** Chuyển trang an toàn: dùng router của Next, nếu sau 1,2 giây vẫn chưa chuyển thì tải lại trang đích (dự phòng cho Safari). */
export function go(router: { push: (u: string) => void }, url: string) {
  const from = window.location.pathname + window.location.search;
  router.push(url);
  setTimeout(() => {
    if (window.location.pathname + window.location.search === from) window.location.href = url;
  }, 1200);
}
