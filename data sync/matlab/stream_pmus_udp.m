function stream_pmus_udp(V123, varargin)
%STREAM_PMUS_UDP  Replay the logged IEEE-123 phasors as TWO unsynchronised PMUs (sector 1 / sector 2).
%
%   out = sim('IEEE123bus_v2019b_Discrete_ZIPload');
%   stream_pmus_udp(out.V123)                    % timeseries
%   stream_pmus_udp(V123, 'Time', tout)          % plain [T x 390] array + time vector
%
% Each PMU samples the SAME simulation at its own rate and phase (linear interpolation of the logged phasors), stamps
% every frame with its OWN clock (offset + drift) and sends it to its own UDP port. Parameters and the bus lists of
% the two sectors are read from server/data/sectors.json, so MATLAB and the web app always agree.
%
% NOTE: V123 is logged every 0.1 s by default. For PMU rates above 10 Hz set the 'To Workspace' sample time to
% 0.005 s (or smaller) so the PMUs have real data between the samples instead of an interpolated 10 Hz signal.
%
% Options: 'Host' ('127.0.0.1'), 'Sectors' (path to sectors.json), 'Speed' (1 = real time), 'Loop' (false),
%          'ChunkSize' (25 buses/packet)
%
% Packet (little-endian float64):
%   [2, pmuId, seq, tLocalMs, simTimeS, chunkIdx, chunkCount, N,  N x (busId, |Va|,|Vb|,|Vc|, angA,angB,angC)]
p = inputParser;
addParameter(p, 'Time', []);       addParameter(p, 'Host', '127.0.0.1');
addParameter(p, 'Sectors', fullfile(fileparts(mfilename('fullpath')), '..', 'server', 'data', 'sectors.json'));
addParameter(p, 'Speed', 1);       addParameter(p, 'Loop', false);   addParameter(p, 'ChunkSize', 25);
parse(p, varargin{:}); o = p.Results;

if isa(V123, 'timeseries'),                      t = V123.Time(:);    D = squeeze(V123.Data);
elseif isstruct(V123) && isfield(V123, 'signals'), t = V123.time(:);  D = squeeze(V123.signals.values);
else,                                             t = o.Time(:);       D = squeeze(V123);
end
if isempty(t), error('Pass ''Time'', tout when V123 is a plain array.'); end
if size(D, 1) ~= numel(t), D = D.'; end

order = ieee123_signal_order();  nSig = numel(order);
if size(D, 2) ~= 3 * nSig, error('V123 has %d columns, expected %d.', size(D, 2), 3 * nSig); end
isBus = ~cellfun('isempty', regexp(order, '^V\d+$', 'once'));
ids   = cellfun(@(s) str2double(s(2:end)), order(isBus)); ids = ids(:);
cols  = reshape(1:3*nSig, 3, []);  cols = cols(:, isBus);              % 3 x nBus (a,b,c column of every bus)

cfg = jsondecode(fileread(o.Sectors));
nP  = numel(cfg.sectors);
pm  = struct('id', {}, 'port', {}, 'rate', {}, 'off', {}, 'drift', {}, 'phase', {}, 'busIdx', {});
for k = 1:nP
    s = cfg.sectors(k); q = s.pmu;
    [~, busIdx] = ismember(s.buses(:), ids);  busIdx = busIdx(busIdx > 0);
    pm(k) = struct('id', q.id, 'port', q.port, 'rate', q.rateHz, 'off', q.clockOffsetMs, ...
                   'drift', q.driftPpm * 1e-6, 'phase', q.phaseMs, 'busIdx', busIdx);
    fprintf('PMU %d (%s): %d buses @ %g Hz -> %s:%d  offset %g ms, drift %g ppm, phase %g ms\n', ...
        q.id, s.name, numel(busIdx), q.rateHz, o.Host, q.port, q.clockOffsetMs, q.driftPpm, q.phaseMs);
end

% sampling instants of all PMUs on the simulation time axis, merged and sorted
ev = zeros(0, 3);                                                        % [simTime, pmu index, seq]
for k = 1:nP
    ts = (t(1) + pm(k).phase / 1000) : (1 / pm(k).rate) : t(end);
    ev = [ev; ts(:), k * ones(numel(ts), 1), (0:numel(ts)-1).']; %#ok<AGROW>
end
ev = sortrows(ev, 1);

u = udpport('byte');   cleanup = onCleanup(@() delete(u)); %#ok<NASGU>
repeat = true;
while repeat
    epochMs = posixtime(datetime('now', 'TimeZone', 'UTC')) * 1000;     % "true" start time shared by both PMUs
    t0 = tic;
    for e = 1:size(ev, 1)
        ts = ev(e, 1); k = ev(e, 2); seq = ev(e, 3);
        pause(max(0, (ts - t(1)) / o.Speed - toc(t0)));
        i = find(t <= ts, 1, 'last'); i = min(i, numel(t) - 1);
        w = (ts - t(i)) / (t(i+1) - t(i));
        idx = pm(k).busIdx;
        C   = cols(:, idx);                                              % 3 x n
        Vi  = ((1 - w) * D(i, C(:)) + w * D(i+1, C(:)));
        Vi  = reshape(Vi, 3, []).';                                      % n x 3 complex
        R   = [ids(idx), abs(Vi), angle(Vi) * 180 / pi];
        simMs   = (ts - t(1)) * 1000;
        tLocal  = epochMs + simMs + pm(k).off + pm(k).drift * simMs;     % this PMU's own clock
        nB = size(R, 1); nC = ceil(nB / o.ChunkSize);
        for c = 1:nC
            r = (c-1)*o.ChunkSize + 1 : min(c*o.ChunkSize, nB);
            pkt = [2; pm(k).id; seq; tLocal; ts; c-1; nC; numel(r); reshape(R(r, :).', [], 1)];
            write(u, pkt, 'double', o.Host, pm(k).port);
        end
    end
    repeat = o.Loop;
end
disp('Done.');
end
