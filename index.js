#!/usr/bin/env node

const program = require('commander');
const { HueApi, lightState } = require('node-hue-api');
const effects = require('./effects');

program
    .option('--hostname <hostname>', 'Bridge hostname')
    .option('--username <username>', 'Bridge username')
    .option('--group-id <group-id>', 'Light group to target')
    .option('--effect <effect-name>', 'Light effect to apply to group')
    .parse(process.argv);

const { hostname, username, groupId, effect } = program;

if (!hostname || !username || !groupId || !effect) {
    return program.outputHelp((helpText) => helpText);
}

const hueClient = new HueApi(hostname, username);

const toLightState = (stateObj) => {
    let state = lightState.create();
    state = stateObj.on ? state.on() : state.off();
    return state
        .bri(stateObj.bri)
        .hue(stateObj.hue)
        .sat(stateObj.sat)
        .transition(stateObj.transition || 1000);
};

const getGroupLightStates = async (groupId) => {
    const { lights } = await hueClient.getGroup(groupId);
    const lightStatuses = await Promise.all(lights.map((light) => hueClient.lightStatus(light)));

    return lightStatuses.map((lightStatus, index) => ({
        id: lights[index],
        state: toLightState(lightStatus.state),
    }));
};

const setLightStates = async (lightStates) =>
    Promise.all(lightStates.map((lightState) => hueClient.setLightState(lightState.id, lightState.state)));

const delay = (delayInMs) => () =>
    new Promise(function(resolve) {
        setTimeout(resolve, delayInMs);
    });

(async function() {
    const queue = [];
    const lightStates = await getGroupLightStates(groupId);

    effects[effect].forEach((effectState) => {
        const state = toLightState(effectState);
        queue.push(() => hueClient.setGroupLightState(groupId, state));
        queue.push(delay(effectState.transition));
    });

    let next;

    while ((next = queue.shift())) {
        await next();
    }

    await setLightStates(lightStates);
})();
