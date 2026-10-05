import { Ije } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui';

const form = document.getElementById('connect-form') as HTMLFormElement;
const targetsHost = document.getElementById('targets') as HTMLDivElement;
const logEl = document.getElementById('log') as HTMLDivElement;

function log(message: string) {
  logEl.textContent = `${message}\n${logEl.textContent ?? ''}`.slice(0, 2000);
}

async function connect(apiUrl: string, apiKey: string, deviceId: string) {
  // No MQTT here: the targets read the REST API only.
  await Ije.init({ apiKey, apiUrl, mqttUrl: '' });
  targetsHost.replaceChildren();
  const element = document.createElement('ije-device-targets');
  element.setAttribute('device-id', deviceId);
  for (const name of ['ije-setpoint-saved', 'ije-setpoint-removed', 'ije-command-sent', 'ije-create-command', 'ije-error']) {
    element.addEventListener(name, (event) => log(`${name} ${JSON.stringify((event as CustomEvent).detail)}`));
  }
  element.addEventListener('ije-create-command', () => {
    // A host builds its own Command form; this demo just says so.
    log('Host would open its own "create Command" flow here, then call refreshCommands().');
  });
  targetsHost.appendChild(element);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
  void connect(value('api-url'), value('api-key'), value('device-id'));
});

(window as unknown as { connectTargets: typeof connect }).connectTargets = connect;
