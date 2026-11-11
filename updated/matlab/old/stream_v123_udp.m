function stream_v123_udp(V123, varargin)
%STREAM_V123_UDP  Replay the logged IEEE-123 bus phasors to the web app over UDP.
%
%   out = sim('IEEE123bus_v2019b_Discrete_ZIPload');
%   stream_v123_udp(out.V123)                       % timeseries
%   stream_v123_udp(V123, 'Time', tout)             % plain [T x 390] array + time vector
%
% Options: 'Host' ('127.0.0.1'), 'Port' (5005), 'Speed' (1 = real time, 10 = 10x faster),
%          'Loop' (false), 'ChunkSize' (25 buses per packet -> stays under the 1500 B MTU)
%
% Packet (little-endian float64): [1, simTime, N, then N x (busId, |Va|,|Vb|,|Vc|, angA,angB,angC)]
% Volts are phase-to-ground RMS, angles in degrees.
p = inputParser;
addParameter(p, 'Time', []);      addParameter(p, 'Host', '127.0.0.1');
addParameter(p, 'Port', 5005);    addParameter(p, 'Speed', 1);
addParameter(p, 'Loop', false);   addParameter(p, 'ChunkSize', 25);
parse(p, varargin{:}); o = p.Results;

if isa(V123, 'timeseries'),                      t = V123.Time(:);    D = squeeze(V123.Data);
elseif isstruct(V123) && isfield(V123, 'signals'), t = V123.time(:);  D = squeeze(V123.signals.values);
else,                                             t = o.Time(:);       D = squeeze(V123);
end
if isempty(t), error('Pass ''Time'', tout when V123 is a plain array.'); end
if size(D, 1) ~= numel(t), D = D.'; end

order = ieee123_signal_order();  nSig = numel(order);
if size(D, 2) ~= 3 * nSig
    error('V123 has %d columns but %d signals x 3 phases = %d were expected.', size(D, 2), nSig, 3 * nSig);
end
isBus = ~cellfun('isempty', regexp(order, '^V\d+$', 'once'));
ids   = cellfun(@(s) str2double(s(2:end)), order(isBus)); ids = ids(:);
cols  = reshape(1:3*nSig, 3, []);  cols = cols(:, isBus);  cols = cols(:).';   % a,b,c per bus
nBus  = numel(ids);

[send, keep] = open_udp(o.Host, o.Port); %#ok<ASGLU>
fprintf('Streaming %d buses to %s:%d (%d samples, speed x%g)... Ctrl+C to stop\n', nBus, o.Host, o.Port, numel(t), o.Speed);
repeat = true;
while repeat
    t0 = tic;
    for i = 1:numel(t)
        pause(max(0, (t(i) - t(1)) / o.Speed - toc(t0)));
        Vi = reshape(D(i, cols), 3, []).';                 % nBus x 3 complex
        R  = [ids, abs(Vi), angle(Vi) * 180 / pi];         % nBus x 7
        for k = 1:o.ChunkSize:nBus
            idx = k:min(k + o.ChunkSize - 1, nBus);
            send([1; t(i); numel(idx); reshape(R(idx, :).', [], 1)]);
        end
    end
    repeat = o.Loop;
end
disp('Done.');
end

function [send, keep] = open_udp(host, port)
if exist('udpport', 'file')                      % R2020b+
    u = udpport('byte');
    send = @(x) write(u, x, 'double', host, port);
    keep = onCleanup(@() delete(u));
else                                              % older releases (Instrument Control Toolbox)
    u = udp(host, port); fopen(u);
    send = @(x) fwrite(u, x, 'double');
    keep = onCleanup(@() fclose(u));
end
end
