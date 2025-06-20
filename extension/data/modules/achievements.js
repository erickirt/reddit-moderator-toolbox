import $ from 'jquery';

import * as TBCore from '../tbcore.js';
import * as TBHelpers from '../tbhelpers.js';
import {Module} from '../tbmodule.jsx';
import {buildType} from '../util/buildenv.ts';
import createLogger from '../util/logging.ts';
import {getSettingAsync} from '../util/settings.ts';

const log = createLogger('Achievements');

const self = new Module({
    name: 'Achievements',
    id: 'Achievements',
    enabledByDefault: true,
    settings: [
        {
            id: 'save',
            type: 'achievement_save',
            default: '',
        },
        {
            id: 'lastSeen',
            type: 'number',
            default: () => TBHelpers.getTime(),
            hidden: true,
        },
    ],
}, init);

// This isn't really a module you do things with - we sort it to the bottom
// of the settings list
self.sort = {
    location: 'afterModules',
    order: 1, // should be the first item after the module list
};

// Saves
function Manager () {
    let saves = [];
    let saveIndex = 0;

    const achievements = [];

    this.init = async function () {
        const save = await self.get('save');
        if (save.length > 0) {
            saves = this.decodeSave(save);
        }
    };

    this.register = function (title, description, achievement) {
        this.registerTarget(title, description, 1, achievement);
    };

    this.registerTarget = function (title, description, target, achievement) {
        this.registerSeries([title], description, [target], achievement);
    };

    this.registerSeries = async function (titles, description, maxValues, achievement) {
        if (saveIndex >= saves.length) {
            saves.push(0);
        }

        const debugMode = await getSettingAsync('Utils', 'debugMode', false);

        const achievementsBlock = [];
        for (let i = 0; i < maxValues.length; i++) {
            const title = titles[i];
            const maxValue = maxValues[i];

            log.debug('Registering Achievement');
            if (debugMode) {
                log.debug(`  name=${title}`);
            } // spoilers
            log.debug(`  maxValue=${maxValue}`);
            log.debug(`  saveIndex=${saveIndex}`);

            achievementsBlock.push({
                title,
                descr: description.replace(/\{0}/g, maxValue),
                maxValue,
                saveIndex,
            });
        }
        achievements.push(achievementsBlock);

        achievement(saveIndex);
        saveIndex++;
    };

    this.unlock = function (saveIndex, value) {
        if (value === undefined) {
            value = 1;
        }
        log.debug(`Unlocking achievement block: index=${saveIndex}, value=${value}`);

        const old = saves[saveIndex];
        log.debug(`  Old value: ${saves[saveIndex]}`);
        saves[saveIndex] += value;
        log.debug(`  New value: ${saves[saveIndex]}`);

        const achievementsBlock = achievements[saveIndex];
        let achievement;
        for (let index = 0; index < achievementsBlock.length; index++) {
            log.debug(`  Checking achievement ${index}`);
            achievement = achievementsBlock[index];
            log.debug(`    Comparing to max value: ${achievement.maxValue}`);
            if (saves[saveIndex] >= achievement.maxValue && old < achievement.maxValue) {
                let title = achievement.title;

                // eh, close enough.
                // any better solution for links requires re-writing all the rewriting register functions
                // to support another prop.  If someone want to do that, go for it.
                try {
                    title = $(achievement.title).text() || achievement.title;
                } catch (e) {
                    log.debug(`error: ${e}`);
                }

                log.debug(`${title} Unlocked!`);
                TBCore.notification(
                    'Mod achievement unlocked!',
                    title,
                    `${window.location.pathname}#?tbsettings=${self.id}`,
                );
            }
        }

        if (achievement && saves[saveIndex] > achievement.maxValue) {
            saves[saveIndex] = achievement.maxValue;
        }
        this.save();
    };

    this.save = function () {
        let save = '';
        saves.forEach((saveValue, saveIndex) => {
            save += saveValue;
            if (saveIndex < saves.length - 1) {
                save += ';';
            }
        });
        save = btoa(save);
        self.set('save', save);
    };

    // Utilities

    this.decodeSave = function (save) {
        const vals = atob(save).split(';');
        // Because '2' + 1 = 21
        if (vals && vals.length > 0) {
            for (let i = 0; i < vals.length; i++) {
                vals[i] = parseInt(vals[i]);
            }
        }
        return vals;
    };

    this.getAchievementBlockCount = function () {
        return achievements.length;
    };

    this.getAchievementCount = function (saveIndex) {
        return achievements[saveIndex].length;
    };

    this.getAchievementTotal = function () {
        let total = 0;
        for (let saveIndex = 0; saveIndex < achievements.length; saveIndex++) {
            total += this.getAchievementCount(saveIndex);
        }
        return total;
    };

    this.getUnlockedCount = function () {
        let count = 0;
        for (let saveIndex = 0; saveIndex < achievements.length; saveIndex++) {
            const achievementsBlock = achievements[saveIndex];
            for (let index = 0; index < achievementsBlock.length; index++) {
                if (this.isUnlocked(saveIndex, index, saves)) {
                    count++;
                }
            }
        }
        return count;
    };

    this.getAchievement = function (saveIndex, index) {
        return achievements[saveIndex][index];
    };

    this.isUnlocked = function (saveIndex, index, saves) {
        const a = this.getAchievement(saveIndex, index);
        if (!(saves instanceof Array) || a.saveIndex >= saves.length) {
            return false;
        }

        return saves[a.saveIndex] >= a.maxValue;
    };
}

// Always load the manager so achievements can still be viewed if the module is disabled
self.manager = new Manager();
self.manager.init();

// Init module
function init ({lastSeen}) {
    const $body = $('body');

    // Achievement definitions
    log.debug('Registering achievements');

    // Random awesome
    self.manager.register(
        '<a href="https://www.youtube.com/watch?v=StTqXEQ2l-Y" target="_blank">being awesome</a>',
        'toolbox just feels like you\'re awesome today',
        saveIndex => {
            const awesome = 7;
            const chanceOfBeingAwesome = TBHelpers.getRandomNumber(10000);

            log.debug(`You rolled a: ${chanceOfBeingAwesome}`);
            if (awesome === chanceOfBeingAwesome) {
                self.manager.unlock(saveIndex);
            }
        },
    );

    // Still Alive (TODO: can we make links work?)
    self.manager.register(
        '<a href="https://www.youtube.com/watch?v=Y6ljFaKRTrI" target="_blank">not dead yet</a>',
        'Spent a week away from reddit',
        saveIndex => {
            // BUG: this one keeps firing on default no value for lastSeen.
            // I tried defaulting to now but it's still wonky.
            const now = TBHelpers.getTime();
            const timeSince = now - lastSeen;
            const daysSince = TBHelpers.millisecondsToDays(timeSince);
            log.debug(`daysSince: ${daysSince}`);

            if (daysSince >= 7) {
                // log.debug("you've got an award!");
                self.manager.unlock(saveIndex);
            }

            self.set('lastSeen', now);
        },
    );

    // toolbox Loves You: Look at the about page
    self.manager.register(
        `<a href="${
            TBCore.link(
                '/message/compose?to=%2Fr%2Ftoolbox&subject=toolbox%20loves%20me!&message=i%20can%20haz%20flair%3F',
            )
        }" target="_blank">toolbox loves you</a>`,
        'Looked at the about page. <3',
        saveIndex => {
            TBCore.catchEvent(TBCore.events.TB_ABOUT_PAGE, () => {
                self.manager.unlock(saveIndex);
            });
        },
    );

    // Beta testers
    self.manager.register('bug hunter', 'Beta testing toolbox', saveIndex => {
        if (buildType === 'beta') {
            self.manager.unlock(saveIndex, 1);
        }
    });

    // Judas
    self.manager.register('Judas', 'Why do you hate toolbox devs? :\'( ', saveIndex => {
        $body.on('click', 'form.remove-button, a.pretty-button.negative, a.pretty-button.neutral', async function () {
            const $this = $(this);
            const thingInfo = await TBCore.getThingInfo($this);
            const auth = thingInfo.author;

            if ((await TBCore.getToolboxDevs()).indexOf(auth) !== -1) {
                self.manager.unlock(saveIndex, 1);
            }
            // TODO: wait for 'yes' click.
            // $body.on('click', '.yes', function(){
            //  log.debug('yes clicked');
            // });
        });
    });

    // approving stuff
    self.manager.registerSeries(
        ['too nice', 'way too nice', 'big softie', 'approvening master', 'the kinda mod reddit deserves'],
        'Approved {0} things',
        [50, 200, 1000, 10000, 20000],
        saveIndex => {
            // If just the button is used.
            $body.on('click', '.pretty-button, .approve-button', function () {
                const $this = $(this);
                if ($this.hasClass('positive') || $this.hasClass('approve-button')) {
                    self.manager.unlock(saveIndex, 1);
                }
            });

            // If the API is used
            TBCore.catchEvent(TBCore.events.TB_APPROVE_THING, () => {
                self.manager.unlock(saveIndex, 1);
            });
        },
    );

    // Mod mail
    self.manager.registerSeries(
        [
            'hic sunt dracones',
            'just checkin\' the mail',
            '<a href="https://www.youtube.com/watch?v=425GpjTSlS4" target="_blank">Mr. Postman</a>',
            'You\'ve got mail!',
        ],
        'Checked mod mail {0} times!',
        [1, 100, 1000, 10000],
        saveIndex => {
            if (TBCore.isModmail) {
                self.manager.unlock(saveIndex, 1);
            }
        },
    );

    // Empty queue
    self.manager.registerSeries(
        [
            'kitteh get!',
            'puppy power!',
            '<a href="https://www.youtube.com/watch?v=Fdc765l9psM" target="_blank">Dr. Jan Itor</a>',
            '/u/Kylde',
        ],
        'Cleared your queues {0} times!',
        [10, 50, 100, 700],
        saveIndex => {
            if (TBCore.isModpage && $body.find('p#noresults').length > 0) {
                self.manager.unlock(saveIndex, 1);
            }
        },
    );

    // Found flying Snoo
    self.manager.register('Cadbury Bunny', 'Found flying Snoo.', saveIndex => {
        TBCore.catchEvent(TBCore.events.TB_FLY_SNOO, () => {
            self.manager.unlock(saveIndex);
        });
    });

    // Killed Snoo
    self.manager.register('you bastard!', 'Killed Snoo.', saveIndex => {
        TBCore.catchEvent(TBCore.events.TB_KILL_SNOO, () => {
            self.manager.unlock(saveIndex);
        });
    });

    // New modmail access
    self.manager.register('mannomail', 'No one knows, send hate mail to /u/thatastronautguy', saveIndex => {
        if (window.location.href.startsWith('https://mod.reddit.com/mail')) {
            self.manager.unlock(saveIndex);
        }
    });
}

export default self;
