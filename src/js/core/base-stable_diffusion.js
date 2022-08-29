/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from '../config.js';
import Dialog_class from '../libs/popup.js';
import Base_gui_class from './base-gui.js';
import Base_layers_class from './base-layers'
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import Pica from './../../../node_modules/pica/dist/pica.js';
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
		this.pica = Pica();
		this.db = {
			prompts: [],
			sampler: "k_euler_a",
			cfg_scale: 10,
			ddim_steps: 20,
			denoising_strength: 0.5,
			width: 512,
			height: 512
		}

		this.events()
	}

	async connect_and_check(server_url) {
		console.log(server_url)
		this.backend_client = axios.create({
			baseURL: server_url,
		})

		try {
			await this.backend_client.get("/", { timeout: 5*1000 })
			alertify.alert('Stable diffusion backend connected!', 3);
			window.localStorage.setItem("server_url", server_url)
		} catch (error) {
			alertify.alert('Invalid backend!', 3);
		}
	}

	async events() {
		const server_url = window.localStorage.getItem("server_url")
		if(server_url) {
			await this.connect_and_check(server_url)
			console.log(this.backend_client)
		}
	}

	connect() {
		const _this = this
		var settings = {
			title: 'Connect to server',
			params: [
				{name: "server_url", title: "Server URL:", value: "http://localhost:7860"},
			],
			on_load: function (params, popup) {
			},
			on_finish: async function ({ server_url }) {
				await _this.connect_and_check(server_url).bind(_this)
			},
		};
		this.POP.show(settings);
	}

	on_paste(data, resize_to_img) {
		const generatedImage = new Image();
		// const _this = this
		generatedImage.onload = ()  => {
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
			const width = resize_to_img ? generatedImage.width : config.WIDTH
			const height = resize_to_img ? generatedImage.height : config.HEIGHT
			app.State.do_action(
				new app.Actions.Bundle_action('insert_image', 'Insert Image', [
					new app.Actions.Insert_layer_action(new_layer),
					new app.Actions.Autoresize_canvas_action(width, height, null, true, true)
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

	async wait_submit_and_run(params, popup, fn) {
		popup.el.querySelector('[data-id="popup_ok"]').style.visibility = 'hidden'
		const cancel_btn = popup.el.querySelector('[data-id="popup_close"]')
		const exit_btn = popup.el.querySelector('[data-id="popup_cancel"]')

		const submit_btn = document.createElement('button')
		submit_btn.classList.add("button")
		submit_btn.classList.add("trn")
		submit_btn.innerText = "Submit"

		submit_btn.addEventListener("click", async () => {
			// add loading indicator
			submit_btn.disabled = true
			submit_btn.innerText = "Loading..."
			cancel_btn.disabled = true
			exit_btn.disabled = true

			const data = {}
			Object.entries(params).forEach(([k, v]) => {
				const val = document.getElementById(`pop_data_${k}`).value
				if(typeof v === "number") {
					data[k] = parseFloat(val)
				} else {
					data[k] = val
				}
			})

			await fn(data)

			submit_btn.disabled = false
			submit_btn.innerText = "Submit"
			cancel_btn.disabled = false
			exit_btn.disabled = false
		})

		popup.el.querySelector('.buttons').prepend(submit_btn);
	}

	text_to_image() {
		const _this = this
		var settings = {
			title: 'Text to image',
			params: [
				{name: "prompt", title: "Prompt:", type: "textarea", value: this.get_latest_prompt()},
				{name: "sampler", title: "Sampler:", value: this.db.sampler},
				{name: "cfg_scale", title: "Scale:", value: this.db.cfg_scale},
				{name: "ddim_steps", title: "Steps:", value: this.db.ddim_steps},
				{name: "resize_to_output", title: "Resize canvas to output size:", value: false},
				{name: "width", title: "Width:", value: this.db.width},
				{name: "height", title: "Height:", value: this.db.height},
			],
			on_load: function (params, popup) {
				_this.wait_submit_and_run(params, popup, async({ prompt, sampler, cfg_scale, ddim_steps, resize_to_output, width, height }) => {
					_this.db.prompts.push(prompt)
					_this.db.sampler = sampler
					_this.db.cfg_scale = cfg_scale
					_this.db.ddim_steps = ddim_steps
					_this.db.width = width
					_this.db.height = height

					const { data } = await _this.backend_client.post("/api/predict", {
						fn_index: 0,
						data: [
							prompt, // represents text of 'Prompt' textbox component
							ddim_steps, // represents numeric input of 'Sampling Steps' slider component
							sampler, // represents selected choice of 'Sampling method (k_lms is default k-diffusion sampler)' radio component
							[], // represents list of selected choices of the checkboxgroup component
							0.0, // represents numeric input of 'DDIM ETA' slider component
							1, // represents numeric input of 'Batch count (how many batches of images to generate)' slider component
							1, // represents numeric input of 'Batch size (how many images are in a batch; memory-hungry)' slider component
							cfg_scale, // represents numeric input of 'Classifier Free Guidance Scale (how strongly the image should follow the prompt)' slider component
							undefined, // represents text of 'Seed (blank to randomize)' textbox component
							height, // represents numeric input of 'Height' slider component
							width, // represents numeric input of 'Width' slider component
							undefined, // represents List of JSON objects with filename as 'name' property and base64 data as 'data' property of 'Embeddings file for textual inversion' file component
						]
					})

					_this.on_paste(data.data[0][0], resize_to_output == "on") // image itself
				})
			},
			on_finish: async function ({ prompt, sampler, cfg_scale, ddim_steps }) {
				
			},
		};
		this.POP.show(settings);
	}

	clean_up_img2img_tmp_canvas() {
		const input_image_canvas = document.getElementById("actual_image_canvas");
		if(input_image_canvas) {
			input_image_canvas.remove()
		}
		const mask_image_canvas = document.getElementById("actual_mask_canvas")
		if(mask_image_canvas) {
			mask_image_canvas.remove()
		}
	}

	create_tmp_canvas_by_img_data(id, w, h, img_data, el) {
		const tmp_canvas = document.createElement('canvas')
		tmp_canvas.id = id
		tmp_canvas.width = w
		tmp_canvas.height = h
		tmp_canvas.style.display = 'none'
		const tmp_canvas_ctx = tmp_canvas.getContext("2d");
		tmp_canvas_ctx.putImageData(img_data, 0, 0)
		el.querySelector('.buttons').appendChild(tmp_canvas)
	}

	image_to_image() {
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}

		const _this = this
		var settings = {
			title: 'Image to image',
			params: [
				{name: "prompt", title: "Prompt:", type: "textarea", value: this.get_latest_prompt()},
				{name: "sampler", title: "Sampler:", value: this.db.sampler},
				{name: "cfg_scale", title: "Scale:", value: this.db.cfg_scale},
				{name: "ddim_steps", title: "Steps:", value: this.db.ddim_steps},
				{name: "denoising_strength", title: "Strength:", value: this.db.denoising_strength},
				{name: "mask_layer", title: "Mask layer:", type: "select", values: ["None", ...config.layers.map(l => l.name)]},
				{name: "sampler", title: "Sampler:", value: this.db.sampler},
				{name: "width", title: "Width:", value: this.db.width},
				{name: "height", title: "Height:", value: this.db.height},
			],
			on_load: function (params, popup) {
				//get canvas from layer
				const canvas = _this.Base_layers.convert_layer_to_canvas(null, true);
				const preview_canvas = document.createElement("canvas")
				const preview_ctx = preview_canvas.getContext("2d");

				popup.el.querySelector('[data-id="popup_cancel"]').style.visibility = 'hidden'
				const apply_btn = document.createElement('button')
				apply_btn.classList.add("button")
				apply_btn.classList.add("trn")
				apply_btn.innerText = "Apply"
				apply_btn.disabled = true
				apply_btn.addEventListener('click', () => {
					app.State.do_action(
						new app.Actions.Update_layer_image_action(preview_canvas)
					);
				})
				popup.el.querySelector('.buttons').appendChild(apply_btn);

				document.getElementById('pop_data_mask_layer').addEventListener('change', (e) => {
					_this.clean_up_img2img_tmp_canvas()

					const canvas = _this.Base_layers.convert_layer_to_canvas(null, true);
					const canvas_ctx = canvas.getContext("2d");

					const value = e.target.value
					if(value == "None") {
						// restore
						// TODO: better use function
						preview_ctx.fillStyle = "white";
						preview_ctx.fillRect(0, 0, canvas.width, canvas.height);

						const preview_image = new Image()
						preview_image.onload = () => {
							preview_ctx.drawImage(preview_image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
						}
						preview_image.src = canvas.toDataURL("image/png")

						// delete temp mask canvas if exist
						const mask_canvas = document.getElementById("actual_mask_canvas")
						if(mask_canvas) {
							mask_canvas.remove()
						}
						return
					}

					// find layer by name
					const maskLayer = config.layers.find(l => l.name === e.target.value)
					// should not happen
					if (!maskLayer) return

					const currentLayer = config.layer

					console.log(maskLayer.id)

					const mask_canvas = _this.Base_layers.convert_layer_to_canvas(maskLayer.id);
					const mask_canvas_ctx = mask_canvas.getContext("2d");
					console.log("canvas", canvas.width, canvas.height)
					console.log("mask canvas", mask_canvas.width, mask_canvas.height)

					const maskImgData = mask_canvas_ctx.getImageData(currentLayer.x, currentLayer.y, preview_canvas.width, preview_canvas.height)
					const maskActualImgData = mask_canvas_ctx.getImageData(currentLayer.x, currentLayer.y, preview_canvas.width, preview_canvas.height)
					const canvasImgData = canvas_ctx.getImageData(0, 0, preview_canvas.width, preview_canvas.height)
					for (let i = 0; i < maskImgData.data.length / 4; i++) {
						const ir = 4 * i, ig = 4 * i + 1, ib = 4 * i + 2, ia = 4 * i + 3

						const [r, g, b, a] = [maskImgData.data[ir], maskImgData.data[ig], maskImgData.data[ib], maskImgData.data[ia]]
						if(r == 0 && g == 0 && b == 0 && a == 0) {
							// use original
							maskImgData.data[ir] = canvasImgData.data[ir]
							maskImgData.data[ib] = canvasImgData.data[ib]
							maskImgData.data[ig] = canvasImgData.data[ig]
							maskImgData.data[ia] = canvasImgData.data[ia]

							maskActualImgData.data[ir] = 0
							maskActualImgData.data[ib] = 0
							maskActualImgData.data[ig] = 0
							maskActualImgData.data[ia] = 255
							continue
						}

						// have color
						maskImgData.data[ir] = Math.floor(canvasImgData.data[ir] / 2)
						maskImgData.data[ib] = Math.floor(canvasImgData.data[ib] / 2)
						maskImgData.data[ig] = Math.floor(canvasImgData.data[ig] / 2)
						maskImgData.data[ia] = 256

						maskActualImgData.data[ir] = 255
						maskActualImgData.data[ib] = 255
						maskActualImgData.data[ig] = 255
						maskActualImgData.data[ia] = 255
					}
					preview_ctx.putImageData(maskImgData, 0, 0)

					_this.create_tmp_canvas_by_img_data(
						"actual_mask_canvas",
						preview_canvas.width,
						preview_canvas.height,
						maskActualImgData,
						popup.el
					)
					_this.create_tmp_canvas_by_img_data(
						"actual_image_canvas",
						preview_canvas.width,
						preview_canvas.height,
						canvasImgData,
						popup.el
					)
				})

				_this.wait_submit_and_run(params, popup, async ({ prompt, sampler, cfg_scale, ddim_steps, denoising_strength, width, height }) => {
					apply_btn.disabled = true

					_this.db.prompts.push(prompt)
					_this.db.sampler = sampler
					_this.db.cfg_scale = cfg_scale
					_this.db.ddim_steps = ddim_steps
					_this.db.denoising_strength = denoising_strength
			
					//get canvas from layer
					let input_image_canvas = document.getElementById("actual_image_canvas");
					if(!input_image_canvas) {
						input_image_canvas = document.getElementById("preview_canvas");
					}
					const inputImage = input_image_canvas.toDataURL("image/jpeg")

					let maskImage = undefined
					const mask_canvas = document.getElementById("actual_mask_canvas")
					if(mask_canvas) {
						maskImage = mask_canvas.toDataURL("image/jpeg")
					}
					
					try {
						const { data } = await _this.backend_client.post("/api/predict", {
							fn_index: 3,
							data: [
								prompt, // represents text of 'Prompt' textbox component
								inputImage, // init image
								maskImage, // mask image
								"Regenerate only masked area", // represents selected choice of 'Mask Mode' radio component
								ddim_steps, // represents numeric input of 'Sampling Steps' slider component
								sampler, // represents selected choice of 'Sampling method (k_lms is default k-diffusion sampler)' radio component
								["Save individual images"], // represents list of selected choices of the checkboxgroup component
								1, // represents numeric input of 'Batch count (how many batches of images to generate)' slider component
								1, // represents numeric input of 'Batch size (how many images are in a batch; memory-hungry)' slider component
								cfg_scale, // represents numeric input of 'Classifier Free Guidance Scale (how strongly the image should follow the prompt)' slider component
								denoising_strength, // represents numeric input of 'Denoising Strength' slider component
								undefined, // represents text of 'Seed (blank to randomize)' textbox component
								width, // represents numeric input of 'Height' slider component
								height, // represents numeric input of 'Width' slider component
								"Just resize", // represents selected choice of 'Resize mode' radio component
								undefined, // represents List of JSON objects with filename as 'name' property and base64 data as 'data' property of 'Embeddings file for textual inversion' file component
							]
						})

						_this.clean_up_img2img_tmp_canvas()
		
						//create destination canvas
						var canvas_tmp = document.createElement('canvas');
						var ctx_tmp = canvas_tmp.getContext("2d");
		
						var canvas_tmp_resized = document.createElement('canvas');
						console.log(preview_canvas.width, preview_canvas.height)
						canvas_tmp_resized.width = preview_canvas.width;
						canvas_tmp_resized.height = preview_canvas.height;
		
						const generatedImage = new Image();
						generatedImage.onload = async ()  => {
							canvas_tmp.width = generatedImage.width
							canvas_tmp.height = generatedImage.height
		
							ctx_tmp.drawImage(generatedImage,0,0);
		
							//Pica resize with max quality
							await _this.pica.resize(canvas_tmp, preview_canvas, {
								alpha: false,
							})
							// app.State.do_action(
							// 	new app.Actions.Update_layer_image_action(canvas_tmp_resized)
							// );
							apply_btn.disabled = false
							document.getElementById('pop_data_mask_layer').value = "None"
						}
						generatedImage.src = data.data[0][0]
					} catch (error) {
						// ERROR
						alert(error.response.data)
					}
					
				})

				preview_canvas.id = "preview_canvas"
				preview_canvas.width = canvas.width
				preview_canvas.height = canvas.height
				preview_canvas.style['width'] = `100%`
				preview_canvas.style['maxHeight'] = `500px`

				preview_ctx.fillStyle = "white";
				preview_ctx.fillRect(0, 0, canvas.width, canvas.height);

				const preview_title = document.createElement("p");
				preview_title.id = "preview_title"
				preview_title.innerText = `Preview: (${preview_canvas.width} x ${preview_canvas.height})`
				popup.el.querySelector('.dialog_content').appendChild(preview_title);

				popup.el.querySelector('.dialog_content').appendChild(preview_canvas);

				const preview_image = new Image()
				preview_image.onload = () => {
					preview_ctx.drawImage(preview_image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
				}
				preview_image.src = canvas.toDataURL("image/png")
			},
			on_finish: async function ({ prompt, sampler, cfg_scale, ddim_steps, denoising_strength }) {
			},
		};
		this.POP.show(settings);
	}
}

export default Base_search_class;
