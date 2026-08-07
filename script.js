document.addEventListener('DOMContentLoaded', () => {
    const choiceButtons = document.querySelectorAll('.choice-option');

    choiceButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Efek interaktif saat pilihan di-klik
            const originalBg = this.style.backgroundColor;
            
            this.style.backgroundColor = 'rgba(56, 189, 248, 0.4)';
            this.style.transition = 'background-color 0.1s';
            
            setTimeout(() => {
                this.style.backgroundColor = originalBg;
                this.style.transition = 'all 0.2s ease';
            }, 150);
            
            // Di sini kamu bisa menambahkan logika lanjutan di masa depan,
            // seperti otomatis mencatat history pilihan ke dalam form 'Result'.
        });
    });
});
