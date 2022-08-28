/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from '../config.js';
import Dialog_class from '../libs/popup.js';
import Base_gui_class from './base-gui.js';
import Base_layers_class from './base-layers'
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import app from '../app';
import axios from 'axios'

var instance = null;

class Base_search_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.backend_client = null

		this.POP = new Dialog_class();
		this.Base_gui = new Base_gui_class();
		this.Base_layers = new Base_layers_class();
		this.db = {
			prompts: [],
			sampler: "k_euler_a",
			cfg_scale: 10,
			ddim_steps: 20,
			denoising_strength: 0.5
		}

		this.events();
	}

	events() {
		
	}

	connect() {
		var settings = {
			title: 'Connect to server',
			params: [
				{name: "server_url", title: "Server URL:", value: "http://localhost:7860"},
			],
			on_load: function (params, popup) {
			},
			on_finish: async function ({ server_url }) {
				console.log(server_url)
				this.backend_client = axios.create({
					baseURL: server_url,
				})

				try {
					await this.backend_client.get("/", { timeout: 5*1000 })
					alertify.alert('Stable diffusion backend connected!', 3);
				} catch (error) {
					alertify.alert('Invalid backend!', 3);
				}
			},
		};
		this.POP.show(settings);
	}

	on_paste(data) {
		const generatedImage = new Image();
		// const _this = this
		generatedImage.onload = ()  => {
			console.log(config.WIDTH, config.HEIGHT)
			var new_layer = {
				name: 'Stable diffusion image',
				type: 'image',
				data: data,
				x: 0,
				y: 0,
				width_original: generatedImage.width,
				height_original: generatedImage.height,
				width: generatedImage.width,
				height: generatedImage.height,
			};
			// app.State.do_action(
			// 	new app.Actions.Insert_layer_action(new_layer)
			// );
			app.State.do_action(
				new app.Actions.Bundle_action('insert_image', 'Insert Image', [
					new app.Actions.Insert_layer_action(new_layer),
					new app.Actions.Autoresize_canvas_action(config.WIDTH, config.HEIGHT, null, true, true)
				])
			);
		}
		generatedImage.src = data
	}

	get_latest_prompt() {
		if(this.db.prompts.length == 0) {
			return ""
		}
		const len = this.db.prompts.length
		return this.db.prompts[len-1]
	}

	text_to_image() {
		const _this = this
		var settings = {
			title: 'Text to image',
			params: [
				{name: "prompt", title: "Prompt:", value: this.get_latest_prompt()},
				{name: "sampler", title: "Sampler:", value: this.db.sampler},
				{name: "cfg_scale", title: "Scale:", value: this.db.cfg_scale},
				{name: "ddim_steps", title: "Steps:", value: this.db.ddim_steps},
			],
			on_load: function (params, popup) {
			},
			on_finish: async function ({ prompt, sampler, cfg_scale, ddim_steps }) {
				_this.db.prompts.push(prompt)
				_this.db.sampler = sampler
				_this.db.cfg_scale = cfg_scale
				_this.db.ddim_steps = ddim_steps

				const { data } = await this.backend_client.post("/api/predict", {
					"data": [
						prompt, // represents text of 'Prompt' textbox component
						ddim_steps, // represents numeric input of 'Sampling Steps' slider component
						sampler, // represents selected choice of 'Sampling method (k_lms is default k-diffusion sampler)' radio component
						[], // represents list of selected choices of the checkboxgroup component
						0.0, // represents numeric input of 'DDIM ETA' slider component
						1, // represents numeric input of 'Batch count (how many batches of images to generate)' slider component
						1, // represents numeric input of 'Batch size (how many images are in a batch; memory-hungry)' slider component
						cfg_scale, // represents numeric input of 'Classifier Free Guidance Scale (how strongly the image should follow the prompt)' slider component
						undefined, // represents text of 'Seed (blank to randomize)' textbox component
						512, // represents numeric input of 'Height' slider component
						512, // represents numeric input of 'Width' slider component
						undefined, // represents List of JSON objects with filename as 'name' property and base64 data as 'data' property of 'Embeddings file for textual inversion' file component
					]
				})

				_this.on_paste(data.data[0][0]) // image itself
				console.log(data)
			},
		};
		this.POP.show(settings);
	}

	image_to_image() {
		const _this = this
		var settings = {
			title: 'Image to image',
			params: [
				{name: "prompt", title: "Prompt:", value: this.get_latest_prompt()},
				{name: "sampler", title: "Sampler:", value: this.db.sampler},
				{name: "cfg_scale", title: "Scale:", value: this.db.cfg_scale},
				{name: "ddim_steps", title: "Steps:", value: this.db.ddim_steps},
				{name: "denoising_strength", title: "Strength:", value: this.db.denoising_strength},
			],
			on_load: function (params, popup) {
				if (config.layer.type != 'image') {
					alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
					return;
				}
			},
			on_finish: async function ({ prompt, sampler, cfg_scale, ddim_steps, denoising_strength }) {
				_this.db.prompts.push(prompt)
				_this.db.sampler = sampler
				_this.db.cfg_scale = cfg_scale
				_this.db.ddim_steps = ddim_steps
				_this.db.denoising_strength = denoising_strength
		
				//get canvas from layer
				var canvas = _this.Base_layers.convert_layer_to_canvas(null, true);
				const inputImage = canvas.toDataURL("image/jpeg")
				const { data } = await this.backend_client.post("/api/predict", {
					"data": [
						prompt, // represents text of 'Prompt' textbox component
						{ image: inputImage }, // represents base64 url data, or (if tool == "sketch) a dict of image and mask base64 url data of 'init_info' image component
						"Regenerate only masked area", // represents selected choice of 'Mask Mode' radio component
						ddim_steps, // represents numeric input of 'Sampling Steps' slider component
						sampler, // represents selected choice of 'Sampling method (k_lms is default k-diffusion sampler)' radio component
						[], // represents list of selected choices of the checkboxgroup component
						1, // represents numeric input of 'Batch count (how many batches of images to generate)' slider component
						1, // represents numeric input of 'Batch size (how many images are in a batch; memory-hungry)' slider component
						cfg_scale, // represents numeric input of 'Classifier Free Guidance Scale (how strongly the image should follow the prompt)' slider component
						denoising_strength, // represents numeric input of 'Denoising Strength' slider component
						undefined, // represents text of 'Seed (blank to randomize)' textbox component
						512, // represents numeric input of 'Height' slider component
						512, // represents numeric input of 'Width' slider component
						["Just resize"], // represents selected choice of 'Resize mode' radio component
						undefined, // represents List of JSON objects with filename as 'name' property and base64 data as 'data' property of 'Embeddings file for textual inversion' file component
					]
				})

				var ctx = canvas.getContext("2d");

				const generatedImage = new Image();
				generatedImage.onload = ()  => {
					ctx.drawImage(generatedImage,0,0);
				}
				generatedImage.src = data[0][0];
		
				app.State.do_action(
					new app.Actions.Update_layer_image_action(canvas)
				);
			},
		};
		this.POP.show(settings);
	}
}

export default Base_search_class;
