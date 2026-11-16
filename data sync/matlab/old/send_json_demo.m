% Smallest possible test: send one JSON packet for bus 83 (works from any MATLAB with udpport, R2020b+).
u = udpport('byte');
msg = jsonencode(struct('t', 1.0, 'ids', 83, 'vmag', [2380 2395 2402], 'vang', [0 -120 120]));
write(u, uint8(msg), 'uint8', '127.0.0.1', 5005);
clear u
