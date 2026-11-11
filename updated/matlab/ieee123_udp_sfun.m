function ieee123_udp_sfun(block)
%IEEE123_UDP_SFUN  Level-2 MATLAB S-function (sink). Sends the logged bus phasors over UDP
% at every sample hit WHILE the simulation is running. Added to the model automatically by
% run_ieee123_live.m - you normally never touch this file.
%
% Dialog parameters:  'Host', Port, Speed, Ts, Scale
%   Speed : max simulated seconds per wall-clock second (0 = unthrottled)
%   Scale : multiplier applied to the magnitudes (1 = volts RMS as measured)
% Input   : 390x1 complex  = the signal logged as V123 (130 signals x 3 phases, see ieee123_signal_order)
% Packet  : float64 [1, simTime, N, N x (busId, |Va|,|Vb|,|Vc|, angA,angB,angC)], 25 buses per packet
setup(block);
end

function setup(block)
block.NumDialogPrms = 5;
block.DialogPrmsTunable = {'Nontunable','Nontunable','Nontunable','Nontunable','Nontunable'};
block.NumInputPorts  = 1;
block.NumOutputPorts = 0;
block.SetPreCompInpPortInfoToDynamic;               % accept the complex 390x1 vector as it comes
block.InputPort(1).DirectFeedthrough = true;
block.SampleTimes = [block.DialogPrm(4).Data 0];
block.SimStateCompliance = 'DefaultSimState';
block.RegBlockMethod('Start',     @Start);
block.RegBlockMethod('Outputs',   @Outputs);
block.RegBlockMethod('Terminate', @Terminate);
end

function Start(block)
order = ieee123_signal_order();  nSig = numel(order);
n = block.InputPort(1).Dimensions;
if n ~= 3 * nSig
    error('ieee123_udp_sfun:size', ['The block input has %d elements but %d signals x 3 phases = %d were expected.\n' ...
          'Check that it is connected to the V123 To Workspace input.'], n, nSig, 3 * nSig);
end
isBus = ~cellfun('isempty', regexp(order, '^V\d+$', 'once'));
cols  = reshape(1:n, 3, []);  cols = cols(:, isBus);

S = struct();
S.ids   = cellfun(@(s) str2double(s(2:end)), order(isBus)); S.ids = S.ids(:);
S.cols  = cols(:).';                                  % a,b,c of every real bus
S.chunk = 25;
S.speed = block.DialogPrm(3).Data;
S.scale = block.DialogPrm(5).Data;
S.wall  = [];  S.t0 = 0;  S.sent = 0;
[S.send, S.close] = open_udp(block.DialogPrm(1).Data, block.DialogPrm(2).Data);
store('set', S);
fprintf('[UDP] streaming %d buses to %s:%d\n', numel(S.ids), block.DialogPrm(1).Data, block.DialogPrm(2).Data);
end

function Outputs(block)
S = store('get');
t = block.CurrentTime;
if isempty(S.wall), S.wall = tic; S.t0 = t; store('set', S); end
if S.speed > 0                                        % keep (at most) real-time pace
    pause(max(0, (t - S.t0) / S.speed - toc(S.wall)));
end
u = double(block.InputPort(1).Data(:));
Vi = reshape(u(S.cols), 3, []).';                     % nBus x 3 complex
R  = [S.ids, S.scale * abs(Vi), angle(Vi) * 180 / pi];
R(~isfinite(R)) = 0;
nBus = size(R, 1);
for k = 1:S.chunk:nBus
    idx = k:min(k + S.chunk - 1, nBus);
    S.send([1; t; numel(idx); reshape(R(idx, :).', [], 1)]);
end
end

function Terminate(~)
S = store('get');
if ~isempty(S) && isfield(S, 'close'), try, S.close(); catch, end, end   %#ok<NOCOMMA>
store('set', []);
end

% ------------------------------------------------------------------ helpers
function out = store(op, S)
persistent P
if strcmp(op, 'set'), P = S; end
out = P;
end

function [send, closeFcn] = open_udp(host, port)
if exist('udpport', 'file')                           % R2020b and newer
    u = udpport('byte');
    send = @(x) write(u, x, 'double', host, port);
    closeFcn = @() delete(u);
else                                                  % older releases (Instrument Control Toolbox)
    u = udp(host, port); fopen(u);
    send = @(x) fwrite(u, x, 'double');
    closeFcn = @() fclose(u);
end
end
