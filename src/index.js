// css load
import {drawRoundBox} from "./Screens/tools/drawRoundBox";

require('./main.css');

// js load
import { io } from 'socket.io-client';
import {titleScreen} from "./Screens/title-screen";
import {agreementSoundScreen} from "./Screens/agreement-sound-screen";
import {tooManyUserScreen} from "./Screens/too-many-user-screen";
import {Color_list} from "./data/color_list";
import {drawText} from "./Screens/tools/drawText";

// load html DOM elements
const Background_canvas = document.getElementById('background');
const Background_ctx = Background_canvas.getContext('2d');
const UI_canvas = document.getElementById('ui');
const UI_ctx = UI_canvas.getContext('2d');

// Set Data
const Screen = {};
Screen.userMouse = {
    x: 0,
    y: 0,
    click: false,
    press: false,
};
Screen.userKeyboard = new Array(100).fill(false);
Screen.scale = 1;
Screen.currentScreen = {};
Screen.currentScreen.draw = function () {};
Screen.currentScreen.checkUIList = [];
Screen.X0real = 0;
Screen.Y0real = 0;
Screen.alert = {};
Screen.alert.data = [];
Screen.alert.draw = function() {
    for(let i=0; i<Screen.alert.data.length; i++){
        let color_alpha = (Screen.alert.data[i].time === -1) ? 0.8 : Math.min(0.8, (Screen.alert.data[i].time / Screen.Settings.Display.fps) * 0.8);
        drawRoundBox(UI_ctx, 960, (i*150) + 70, 1600, 120, `rgba(${Color_list.button_gray_2_rgb[0]}, ${Color_list.button_gray_2_rgb[1]}, ${Color_list.button_gray_2_rgb[2]}, ${color_alpha})`, `rgba(${Color_list.button_gray_3_rgb[0]}, ${Color_list.button_gray_3_rgb[1]}, ${Color_list.button_gray_3_rgb[2]}, ${color_alpha})`, 10, 25);
        drawText(UI_ctx, 960, (i*150) + 70, 60, 0, `rgba(${Color_list.text_onmouse_rgb[0]}, ${Color_list.text_onmouse_rgb[1]}, ${Color_list.text_onmouse_rgb[2]}, ${color_alpha})`, undefined, undefined, Screen.alert.data[i].text, "center", "GmarketSansMedium");
        if(Screen.alert.data[i].time > 0){
            Screen.alert.data[i].time--;
        }
        if(Screen.alert.data[i].time === 0){
            Screen.alert.data.splice(i, 1);
        }
    }
};
Screen.alert.add_Data = function (tag, text, time){
    let alreadyExist = false;
    for(let i=0; i<Screen.alert.data.length; i++){
        if(Screen.alert.data[i].tag === tag){
            alreadyExist = true;
            Screen.alert.data[i].text = text;
            Screen.alert.data[i].time = time * Screen.Settings.Display.fps;
            break;
        }
    }
    if(!alreadyExist){
        Screen.alert.data.push({
            tag: tag,
            text: text,
            time: time * Screen.Settings.Display.fps,
        });
    }
}
Screen.activatedHtmlElement = [];
Screen.Settings = {
    Sound: {
        BGM: 100,
    },
    Display: {
        fps: 100,
    }
}

// Set Screen Rendering Loop
window.onload = function () {
    Screen.currentScreen = agreementSoundScreen;
    Screen.currentScreen.initialize(Background_ctx, UI_ctx, Screen);
    canvasResize();
    Screen.display_interval = setInterval( function () {
            Screen.currentScreen.draw(Background_ctx, UI_ctx, Screen);
            Screen.alert.draw();
            Screen.currentScreen.check(Screen.userMouse, Screen.userKeyboard, Screen.currentScreen.checkUIList);
        }, (1000 / Screen.Settings.Display.fps));
}


// Event Listeners
window.addEventListener('resize', function() {
    canvasResize();
})

UI_canvas.addEventListener('mousemove', function(e) {
    Screen.userMouse.x = (e.offsetX / Screen.scale);
    Screen.userMouse.y = (e.offsetY / Screen.scale);
})

UI_canvas.addEventListener('click', function(e) {
    Screen.userMouse.click = true;
})

UI_canvas.addEventListener('mousedown', function(e) {
    Screen.userMouse.press = true;
})

UI_canvas.addEventListener('mouseup', function(e) {
    Screen.userMouse.press = false;
})

UI_canvas.addEventListener('mouseleave', function(e) {
    Screen.userMouse.press = false;
})

UI_canvas.addEventListener('contextmenu', function(e) {
    e.preventDefault();
})

UI_canvas.addEventListener('touchstart', function(e) {
    Screen.userMouse.x = (e.touches[0].clientX - Screen.X0real) / Screen.scale;
    Screen.userMouse.y = (e.touches[0].clientY - Screen.Y0real) / Screen.scale;
    Screen.userMouse.press = true;
})

UI_canvas.addEventListener('touchmove', function(e) {
    Screen.userMouse.x = (e.touches[0].clientX - Screen.X0real) / Screen.scale;
    Screen.userMouse.y = (e.touches[0].clientY - Screen.Y0real) / Screen.scale;
})

UI_canvas.addEventListener('touchend', function(e) {
    Screen.userMouse.press = false;
})

// Socket Event Listeners
window.addEventListener("doSocketConnect", function () {
    Screen.socket = io();

    Screen.socket.on('connected', function (ClientId) {
        Screen.ClientId = ClientId;
        Screen.currentScreen = titleScreen;
        Screen.currentScreen.initialize(Background_ctx, UI_ctx, Screen);
    });

    Screen.socket.on('server full', function () {
        Screen.currentScreen = tooManyUserScreen;
        Screen.currentScreen.initialize(Background_ctx, UI_ctx, Screen);
    })
});

// functions
function canvasResize() {
    if (window.innerWidth * 9 < window.innerHeight * 16) {
        Screen.scale = window.innerWidth / 1920 * 0.9;
    } else {
        Screen.scale = window.innerHeight / 1080 * 0.9;
    }
    Background_canvas.width = 1920 * Screen.scale;
    Background_canvas.height = 1080 * Screen.scale;
    UI_canvas.width = 1920 * Screen.scale;
    UI_canvas.height = 1080 * Screen.scale;
    Background_canvas.style.top = '50%';
    Background_canvas.style.left = '50%';
    Background_canvas.style.transform = 'translate(-50%, -50%)';
    UI_canvas.style.top = '50%';
    UI_canvas.style.left = '50%';
    UI_canvas.style.transform = 'translate(-50%, -50%)';
    Background_ctx.scale(Screen.scale, Screen.scale);
    UI_ctx.scale(Screen.scale, Screen.scale);
    Screen.currentScreen.redrawBackground(Background_ctx);
    for(let i = 0; i < Screen.activatedHtmlElement.length; i++){
        Screen.activatedHtmlElement[i].resize(Screen.scale, window.innerWidth, window.innerHeight);
    }
    Screen.X0real = (window.innerWidth - (1920 * Screen.scale)) / 2;
    Screen.Y0real = (window.innerHeight - (1080 * Screen.scale)) / 2;
}