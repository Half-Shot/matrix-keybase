import { Appservice, IAppserviceRegistration, SimpleFsStorageProvider } from "matrix-bot-sdk"
import { promises as fs } from 'fs'
import { IConfig } from "./config"
const Keybase = require("keybase-bot");
import YAML from 'yaml'
import * as lowdb from "lowdb";
import { MsgSummary } from "keybase-bot/lib/types/chat1";
import { create } from "domain";


export class KeybaseBridge {
    private config!: IConfig;
    private as!: Appservice
    private store!: lowdb.LowdbSync<any>;
    private bots: Map<string, any>; // userid -> bot
    constructor() {
        this.bots = new Map();
    }

    public async start(configPath: string = "./config.yml", registrationPath: string = "./registration.yml") {
        const storage = new SimpleFsStorageProvider("./data.json");
        this.config = await this.loadConfig(configPath);
        const registration = YAML.parse(await fs.readFile(registrationPath, "utf-8")) as IAppserviceRegistration;
        this.as = new Appservice({
            bindAddress: this.config.appservice.bindAddress,
            port: this.config.appservice.port,
            homeserverName: this.config.homeserver.domain,
            homeserverUrl: this.config.homeserver.url,
            registration,
            storage,
        });
        this.store = (storage as any).db;
        this.store.defaults({
            rooms: {},
            remoteRooms: {},
            userProfiles: {},
        })
        this.as.botIntent.underlyingClient.setDisplayName("Keybase Bot");
        console.log("Started bridge on", this.config.appservice.bindAddress, this.config.appservice.port);
        this.as.on("room.invite", this.onRoomInvite.bind(this));
        this.as.on("room.message", this.onRoomMessage.bind(this));
        await this.as.begin();
    }

    private async loadConfig(configPath: string): Promise<IConfig> {
        const fileData = await fs.readFile(configPath, "utf-8");
        return YAML.parse(fileData);
    }

    private async onRoomInvite(roomId: string, inviteEvent: any) {
        if (this.as.isNamespacedUser(inviteEvent.sender)) {
            return;
        }

        await this.as.botIntent.joinRoom(roomId);
        if (!inviteEvent.content.is_direct) {
            this.as.botIntent.sendText(roomId, "The bridge can only handle 1:1 rooms for setting up the bridge");
            this.as.botIntent.underlyingClient.leaveRoom(roomId);
            return;
        }
        await this.store.set(`rooms.${roomId}`, {
            type: "admin",
            user: inviteEvent.sender,
        }).write();
    }

    private async onRoomMessage(roomId: string, event: any) {
        if (this.as.isNamespacedUser(event.sender)) {
            return;
        }

        const bridgeEntry = this.store.get(`rooms.${roomId}`).value();
        if (!bridgeEntry) {
            return;
        }

        if (!event["content"]) return;
        if (event["content"]["msgtype"] !== "m.text") return;
    
        const body: string = event["content"]["body"];

        if (bridgeEntry.type === "admin") {
            const parts = body.split(" ");
            if (parts[0] === "!login") {
                const bot = new Keybase();
                try {
                    console.log("Connecting user", event.sender);
                    await bot.init(parts[1], parts.slice(2).join(" "), {verbose: true});
                    console.log("Logged in");
                    await bot.chat.watchAllChannelsForNewMessages((msg: any) => {
                        this.onKeybaseMessage(event.sender, msg);
                    })
                    console.log("Connected and watching");
                } catch (ex) {
                    console.error("Failed to log in");
                    this.as.botIntent.sendText(roomId, "Failed to log in:" + ex, "m.notice");
                    return;
                }
                this.bots.set(event.sender, bot);
                this.as.botIntent.sendText(roomId, "Connected.", "m.notice");
            } else {
                this.as.botIntent.sendText(roomId, "Command not understood", "m.notice");
            }
        } else if (bridgeEntry.type === "convo") {
            if (!this.bots.has(event.sender)) {
                return;
            }
            const bot = this.bots.get(event.sender);
            const opts = {conversationId: bridgeEntry.conversationId};
            await bot.chat.send(undefined, {body}, opts).then(() => console.log('message sent!'));
        }
    }

    private async onKeybaseMessage(matrixUser: string, messageSummary: MsgSummary) {
        const convo = messageSummary.conversationId;
        messageSummary.sender.username
        const existingRoom = this.store.get(`remoteRooms.${convo}`, null).value();
        let roomId;
        if (!existingRoom) {
            roomId = await this.createPMRoom(matrixUser, messageSummary.sender.uid);
            console.log("Created PM room:", roomId);
            await this.store.set(`remoteRooms.${convo}`, { roomId }).write();
            await this.store.set(`rooms.${roomId}`, {type: "convo", conversationId: convo}).write();
        } else {
            roomId = existingRoom.roomId;
        }
        console.log("Using PM room:", roomId);
        const intent = this.as.getIntentForSuffix(messageSummary.sender.uid);
        const displayname = messageSummary.sender.username || messageSummary.sender.deviceName || messageSummary.sender.deviceId;
        if (this.store.get(`userprofile.${messageSummary.sender.uid}.displayname`, null).value() !== displayname) {            
            await intent.underlyingClient.setDisplayName(
                messageSummary.sender.username || messageSummary.sender.deviceName || messageSummary.sender.deviceId
            );
            await this.store.set(`userProfile.${messageSummary.sender.uid}`, { displayname }).write();
        }
        await intent.sendText(roomId, messageSummary.content.text!.body);
    }

    private async createPMRoom(matrixUser: string, remoteUser: string) {
        const remoteMatrixUser = this.as.getUserIdForSuffix(remoteUser);
        const intent = this.as.getIntentForSuffix(remoteUser);
        return await intent.underlyingClient.createRoom({
            preset: "private_chat",
            is_direct: true,
            invite: [matrixUser],
        });
    }
}