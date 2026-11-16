function [p1,p2,p3,p4,p5] = ieee123_udp_pack(u, t) %#codegen
%IEEE123_UDP_PACK  Body of a MATLAB Function block for LIVE streaming during simulation.
%   u : 390x1 complex  -> output of the Measurements subsystem (the signal logged as V123)
%   t : simulation time (Clock block)
%   p1..p5 : 178x1 double packets (25 buses each) -> one DSP System Toolbox "UDP Send" block each
%            Remote IP = web-server host, Remote port = 5005, sample time 0.1
%   Packet layout (float64): [1; simTime; 25; then per bus: id |Va| |Vb| |Vc| angA angB angC]
IDX = [1; 3; 4; 5; 6; 7; 8; 9; 10; 11; 12; 13; 14; 15; 16; 17; 18; 19; 20; 21; 22; 23; 24; 26; 27; 28; 29; 30; 31; 32; 33; 34; 35; 36; 37; 38; 39; 40; 41; 42; 43; 44; 45; 46; 47; 48; 49; 50; 51; 52; 53; 54; 55; 56; 57; 58; 59; 60; 61; 62; 63; 64; 65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 91; 92; 93; 94; 95; 96; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109; 110; 111; 112; 113; 114; 115; 117; 118; 119; 120; 121; 122; 123; 124; 125; 126; 128; 129; 130];   % rows of V that are real buses (125 of 130 signals)
IDS = [150; 149; 1; 2; 3; 4; 5; 6; 7; 8; 12; 13; 152; 52; 53; 54; 55; 56; 57; 58; 59; 60; 160; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 91; 92; 93; 94; 95; 96; 97; 197; 101; 102; 103; 104; 105; 106; 107; 108; 109; 110; 111; 112; 113; 114; 300; 98; 99; 100; 450; 61; 610; 62; 63; 64; 65; 66; 18; 135; 35; 36; 37; 38; 39; 40; 41; 42; 43; 44; 45; 46; 47; 48; 49; 50; 51; 151; 19; 20; 21; 22; 23; 24; 25; 28; 29; 30; 250; 26; 27; 33; 31; 32; 34; 15; 16; 17; 9; 14; 10; 11];   % bus numbers
V   = reshape(u, 3, []).';                  % 130x3 complex, one row per signal
mag = abs(V(IDX, :));
ang = angle(V(IDX, :)) * 180 / pi;
R   = [IDS, mag, ang];                      % 125x7
p1 = pk(R(  1: 25,:), t);
p2 = pk(R( 26: 50,:), t);
p3 = pk(R( 51: 75,:), t);
p4 = pk(R( 76:100,:), t);
p5 = pk(R(101:125,:), t);
end

function p = pk(R, t)
p = [1; t; 25; reshape(R.', [], 1)];
end
