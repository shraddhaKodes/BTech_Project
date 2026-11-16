function simOut = run_ieee123_live(varargin)
%RUN_IEEE123_LIVE  Open the IEEE 123-bus Simulink model, run it, and stream the live
%                  bus voltages over UDP to the web app while the simulation is running.
%
%   run_ieee123_live                          % defaults: 127.0.0.1:5005, real-time pace
%   run_ieee123_live('Host','192.168.1.20')   % web server on another PC
%   run_ieee123_live('StopTime',Inf)          % run until you press Stop in Simulink
%   run_ieee123_live('Speed',0)               % no throttling (as fast as MATLAB can go)
%
% Options (name/value):
%   Model      model name or full path to the .slx         (default 'IEEE123bus_v2019b_Discrete_ZIPload')
%   Host,Port  UDP destination                             (default '127.0.0.1', 5005)
%   Speed      max simulated s per wall-clock s, 0 = off   (default 1)
%   StopTime   [] keep model's value | number | Inf        (default [])
%   Scale      multiplier on voltage magnitudes            (default 1; use 1/sqrt(2) if the model reports peak values)
%   OpenModel  show the model window                       (default true)
%
% How it works: the script temporarily adds one sink block ("UDP Live Stream", a Level-2
% MATLAB S-function) next to the 'V123' To Workspace block and wires it to the same signal.
% While Simulink runs, that block sends a packet every sample hit (0.1 s of simulated time).
% The block is removed again afterwards - your .slx file is never saved or modified.
p = inputParser;
addParameter(p, 'Model', 'IEEE123bus_v2019b_Discrete_ZIPload');
addParameter(p, 'Host', '127.0.0.1');   addParameter(p, 'Port', 5005);
addParameter(p, 'Speed', 1);            addParameter(p, 'StopTime', []);
addParameter(p, 'Scale', 1);            addParameter(p, 'OpenModel', true);
parse(p, varargin{:});  o = p.Results;

here = fileparts(mfilename('fullpath'));  addpath(here);
file = locate_model(o.Model, here);
[~, mdl] = fileparts(file);

wasLoaded = bdIsLoaded(mdl);
if wasLoaded && strcmp(get_param(mdl, 'Dirty'), 'on')
    error('run_ieee123_live:dirty', 'Model "%s" has unsaved changes. Save or close it first.', mdl);
end
if ~wasLoaded, load_system(file); end
if o.OpenModel, open_system(mdl); end

% ---- find the block that logs V123 and read its sample time
tw = find_system(mdl, 'BlockType', 'ToWorkspace', 'VariableName', 'V123');
if isempty(tw), tw = find_system(mdl, 'LookUnderMasks', 'all', 'BlockType', 'ToWorkspace', 'VariableName', 'V123'); end
if isempty(tw), error('run_ieee123_live:noV123', 'No To Workspace block with variable name V123 was found in "%s".', mdl); end
tw = tw{1};
try, Ts = slResolve(get_param(tw, 'SampleTime'), tw); catch, Ts = 0.1; end   %#ok<NOCOMMA>
if ~(isscalar(Ts) && Ts > 0), Ts = 0.1; end

% ---- remember what we change so we can put it back
orig.stop = get_param(mdl, 'StopTime');
orig.mode = get_param(mdl, 'SimulationMode');
sys = get_param(tw, 'Parent');
blk = [sys '/UDP Live Stream'];
cleaner = onCleanup(@() restore(mdl, blk, orig, wasLoaded, o.OpenModel)); %#ok<NASGU>

% ---- add the streaming sink and wire it to the V123 signal
if getSimulinkBlockHandle(blk) > 0, delete_block(blk); end
add_block('simulink/User-Defined Functions/Level-2 MATLAB S-Function', blk, ...
    'FunctionName', 'ieee123_udp_sfun', ...
    'Parameters', sprintf('''%s'', %d, %g, %.10g, %g', o.Host, o.Port, o.Speed, Ts, o.Scale));
pos = get_param(tw, 'Position');
set_param(blk, 'Position', [pos(1), pos(2) + 70, pos(1) + 130, pos(2) + 110]);
lh  = get_param(tw, 'LineHandles');
src = get_param(lh.Inport, 'SrcPortHandle');
ph  = get_param(blk, 'PortHandles');
add_line(sys, src, ph.Inport(1));

if ~isempty(o.StopTime), set_param(mdl, 'StopTime', lower(num2str(o.StopTime))); end
if ~strcmpi(orig.mode, 'normal'), set_param(mdl, 'SimulationMode', 'normal'); end

fprintf('\nModel      : %s\nStreaming  : udp://%s:%d  every %.3g s of simulation time (speed limit: %g x real time)\nStop time  : %s s   (press Stop in Simulink to end early)\n\n', ...
    mdl, o.Host, o.Port, Ts, o.Speed, get_param(mdl, 'StopTime'));

simOut = sim(mdl);
disp('Simulation finished.');
end

% ------------------------------------------------------------------ helpers
function file = locate_model(name, here)
if exist(name, 'file') == 4 || (exist(name, 'file') == 2 && endsWith(name, '.slx'))   % full path / on path
    w = which(name); if isempty(w), w = name; end
    file = w; return
end
[~, base, ext] = fileparts(name);  if isempty(ext), ext = '.slx'; end
cands = {pwd, here, fullfile(here, '..'), fullfile(here, '..', '..'), fullfile(here, '..', 'simulink')};
for k = 1:numel(cands)
    f = fullfile(cands{k}, [base ext]);
    if exist(f, 'file') == 2, file = char(java.io.File(f).getCanonicalPath()); return, end
end
w = which([base ext]);  if ~isempty(w), file = w; return, end
[f, d] = uigetfile('*.slx', 'Select the IEEE 123-bus Simulink model');
if isequal(f, 0), error('run_ieee123_live:nomodel', 'Model file not found.'); end
file = fullfile(d, f);
end

function restore(mdl, blk, orig, wasLoaded, keepOpen)
try
    if bdIsLoaded(mdl)
        if getSimulinkBlockHandle(blk) > 0, delete_block(blk); end
        set_param(mdl, 'StopTime', orig.stop, 'SimulationMode', orig.mode);
        set_param(mdl, 'Dirty', 'off');
        if ~wasLoaded && ~keepOpen, close_system(mdl, 0); end
    end
catch ME
    warning('run_ieee123_live:cleanup', 'Cleanup problem: %s', ME.message);
end
clear ieee123_udp_sfun
end
