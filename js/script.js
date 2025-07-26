document.addEventListener("DOMContentLoaded", function () {
    const details = document.querySelectorAll("details");

    details.forEach((detail) => {
        detail.addEventListener("click", function () {
            details.forEach((d) => {
                if (d !== detail) {
                    d.removeAttribute("open");
                }
            });
        });
    });
});
