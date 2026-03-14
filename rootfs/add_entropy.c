/*
 * add_entropy.c — Seed the kernel entropy pool via RNDADDENTROPY ioctl.
 *
 * Required in Firecracker VMs running kernel 4.14 (no random.trust_cpu),
 * where FrankenPHP (Go runtime) blocks on getrandom() at startup.
 *
 * Build (must target Linux x86_64, statically linked):
 *   gcc -static -o add_entropy add_entropy.c
 *
 * Place the binary at /usr/local/bin/add_entropy in the rootfs.
 * Called by /init before FrankenPHP starts.
 */

#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/random.h>
#include <time.h>

int main() {
    struct {
        int entropy_count;
        int buf_size;
        unsigned char buf[512];
    } entropy;

    /* Generate pseudo-random data from monotonic clock + stack address */
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    unsigned long seed = ts.tv_nsec ^ ts.tv_sec ^ (unsigned long)&entropy;

    for (int i = 0; i < 512; i++) {
        seed = seed * 6364136223846793005ULL + 1442695040888963407ULL;
        entropy.buf[i] = (unsigned char)(seed >> 32);
    }

    entropy.entropy_count = 4096; /* credits in bits */
    entropy.buf_size = 512;

    int fd = open("/dev/random", O_WRONLY);
    if (fd < 0) {
        perror("open /dev/random");
        return 1;
    }

    if (ioctl(fd, RNDADDENTROPY, &entropy) < 0) {
        perror("RNDADDENTROPY");
        close(fd);
        return 1;
    }

    close(fd);
    printf("Added 4096 bits of entropy\n");
    return 0;
}
